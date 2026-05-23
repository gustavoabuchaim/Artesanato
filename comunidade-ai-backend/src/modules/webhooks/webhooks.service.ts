import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantService } from '../../tenant/tenant.service';

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tenantService: TenantService,
    private readonly logger: PinoLogger,
  ) {}

  async handleStripeWebhook(params: { rawBody: Buffer; signature?: string }) {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') || '';
    const apiKey = this.config.get<string>('STRIPE_SECRET_KEY') || '';
    if (!secret || !apiKey) throw new Error('Stripe não configurado');

    const stripe = new Stripe(apiKey, { apiVersion: '2026-04-22.dahlia' });
    const sig = params.signature;
    if (!sig) throw new BadRequestException('Assinatura ausente');

    let event: unknown;
    try {
      event = stripe.webhooks.constructEvent(params.rawBody, sig, secret);
    } catch {
      this.logger.warn({ event: 'security.webhook_invalid_signature', provider: 'stripe' }, 'Webhook invalid signature');
      throw new BadRequestException('Assinatura inválida');
    }
    const stripeEvent = event as any;
    const payloadHash = crypto.createHash('sha256').update(params.rawBody).digest('hex');

    const tenantId = await this.resolveTenantIdFromEvent(event);

    const already = await this.prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'STRIPE', eventId: stripeEvent.id } },
      select: { id: true, status: true },
    });
    if (already) return { ok: true, deduped: true };

    await this.prisma.webhookEvent.create({
      data: {
        tenantId,
        provider: 'STRIPE',
        eventId: stripeEvent.id,
        payload: event as unknown as never,
        payloadHash,
        status: 'RECEIVED',
      },
      select: { id: true },
    });

    try {
      await this.processStripeEvent({ tenantId, event });
      await this.prisma.webhookEvent.update({
        where: { provider_eventId: { provider: 'STRIPE', eventId: stripeEvent.id } },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'erro';
      await this.prisma.webhookEvent.update({
        where: { provider_eventId: { provider: 'STRIPE', eventId: stripeEvent.id } },
        data: { status: 'FAILED', processedAt: new Date(), error },
      });
      await this.prisma.outboxEvent.create({
        data: { tenantId, topic: 'admin.alert', payload: { kind: 'webhook_failed', provider: 'STRIPE', eventId: stripeEvent.id, error } },
        select: { id: true },
      });
      this.logger.error(
        { event: 'security.webhook_processing_failed', provider: 'stripe', tenantId, webhookEventId: stripeEvent.id },
        'Webhook processing failed',
      );
      throw e;
    }

    return { ok: true };
  }

  async handleMercadoPagoWebhook(params: {
    rawBody?: Buffer;
    body: unknown;
    headers: Record<string, string | undefined>;
    query: Record<string, unknown>;
  }) {
    const token = (this.config.get<string>('MERCADOPAGO_WEBHOOK_TOKEN') ?? '').trim();
    if (token) {
      const provided = (params.headers['x-webhook-token'] ?? (params.query['token'] as any) ?? '').toString();
      if (provided !== token) throw new BadRequestException('Token inválido');
    }

    const eventId = this.extractMercadoPagoEventId(params.body, params.query);
    if (!eventId) throw new BadRequestException('Evento inválido');

    const { tenantId: defaultTenantId } = await this.resolveDefaultTenant();
    const payloadHash = crypto
      .createHash('sha256')
      .update(params.rawBody ?? Buffer.from(JSON.stringify(params.body ?? {})))
      .digest('hex');

    const already = await this.prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'MERCADOPAGO', eventId } },
      select: { id: true, status: true },
    });
    if (already) return { ok: true, deduped: true };

    await this.prisma.webhookEvent.create({
      data: {
        tenantId: defaultTenantId,
        provider: 'MERCADOPAGO',
        eventId,
        payload: params.body as never,
        payloadHash,
        status: 'RECEIVED',
      },
      select: { id: true },
    });

    try {
      await this.processMercadoPagoEvent({ eventId });
      await this.prisma.webhookEvent.update({
        where: { provider_eventId: { provider: 'MERCADOPAGO', eventId } },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'erro';
      await this.prisma.webhookEvent.update({
        where: { provider_eventId: { provider: 'MERCADOPAGO', eventId } },
        data: { status: 'FAILED', processedAt: new Date(), error },
      });
      await this.prisma.outboxEvent.create({
        data: {
          tenantId: defaultTenantId,
          topic: 'admin.alert',
          payload: { kind: 'webhook_failed', provider: 'MERCADOPAGO', eventId, error },
        },
        select: { id: true },
      });
      this.logger.error({ event: 'security.webhook_processing_failed', provider: 'mercadopago', eventId }, 'Webhook processing failed');
      throw e;
    }

    return { ok: true };
  }

  async handleHotmartWebhook(params: { rawBody?: Buffer; body: unknown; headers: Record<string, string | undefined> }) {
    const token = (this.config.get<string>('HOTMART_WEBHOOK_TOKEN') ?? '').trim();
    if (token) {
      const provided = (params.headers['x-hotmart-hottok'] ?? '').toString();
      if (provided !== token) throw new BadRequestException('Token inválido');
    }

    const eventId = this.extractHotmartEventId(params.body);
    const stableId = eventId ?? crypto.createHash('sha256').update(params.rawBody ?? Buffer.from(JSON.stringify(params.body ?? {}))).digest('hex');

    const { tenantId: defaultTenantId } = await this.resolveDefaultTenant();
    const payloadHash = crypto
      .createHash('sha256')
      .update(params.rawBody ?? Buffer.from(JSON.stringify(params.body ?? {})))
      .digest('hex');

    const already = await this.prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'HOTMART', eventId: stableId } },
      select: { id: true, status: true },
    });
    if (already) return { ok: true, deduped: true };

    await this.prisma.webhookEvent.create({
      data: {
        tenantId: defaultTenantId,
        provider: 'HOTMART',
        eventId: stableId,
        payload: params.body as never,
        payloadHash,
        status: 'RECEIVED',
      },
      select: { id: true },
    });

    try {
      await this.processHotmartEvent({ payload: params.body, eventId: stableId });
      await this.prisma.webhookEvent.update({
        where: { provider_eventId: { provider: 'HOTMART', eventId: stableId } },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'erro';
      await this.prisma.webhookEvent.update({
        where: { provider_eventId: { provider: 'HOTMART', eventId: stableId } },
        data: { status: 'FAILED', processedAt: new Date(), error },
      });
      await this.prisma.outboxEvent.create({
        data: { tenantId: defaultTenantId, topic: 'admin.alert', payload: { kind: 'webhook_failed', provider: 'HOTMART', eventId: stableId, error } },
        select: { id: true },
      });
      this.logger.error({ event: 'security.webhook_processing_failed', provider: 'hotmart', eventId: stableId }, 'Webhook processing failed');
      throw e;
    }

    return { ok: true };
  }

  async handlePandaVideoWebhook(params: { rawBody?: Buffer; body: unknown; headers: Record<string, string | undefined> }) {
    const token = (this.config.get<string>('PANDAVIDEO_WEBHOOK_TOKEN') ?? '').trim();
    if (token) {
      const provided = (params.headers['x-pandavideo-token'] ?? params.headers['x-webhook-token'] ?? '').toString();
      if (provided !== token) throw new BadRequestException('Token inválido');
    }

    const payloadHash = crypto
      .createHash('sha256')
      .update(params.rawBody ?? Buffer.from(JSON.stringify(params.body ?? {})))
      .digest('hex');

    const eventId = this.extractPandaVideoEventId(params.body) ?? payloadHash;
    const { tenantId: defaultTenantId } = await this.resolveDefaultTenant();

    const already = await this.prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'PANDAVIDEO', eventId } },
      select: { id: true },
    });
    if (already) return { ok: true, deduped: true };

    await this.prisma.webhookEvent.create({
      data: {
        tenantId: defaultTenantId,
        provider: 'PANDAVIDEO',
        eventId,
        payload: params.body as never,
        payloadHash,
        status: 'RECEIVED',
      },
      select: { id: true },
    });

    try {
      const result = await this.processPandaVideoEvent({ payload: params.body });
      if (result.tenantId) {
        await this.prisma.webhookEvent.update({
          where: { provider_eventId: { provider: 'PANDAVIDEO', eventId } },
          data: { tenantId: result.tenantId },
        });
      }
      await this.prisma.webhookEvent.update({
        where: { provider_eventId: { provider: 'PANDAVIDEO', eventId } },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'erro';
      await this.prisma.webhookEvent.update({
        where: { provider_eventId: { provider: 'PANDAVIDEO', eventId } },
        data: { status: 'FAILED', processedAt: new Date(), error },
      });
      await this.prisma.outboxEvent.create({
        data: { tenantId: defaultTenantId, topic: 'admin.alert', payload: { kind: 'webhook_failed', provider: 'PANDAVIDEO', eventId, error } },
        select: { id: true },
      });
      this.logger.error({ event: 'security.webhook_processing_failed', provider: 'pandavideo', eventId }, 'Webhook processing failed');
      throw e;
    }

    return { ok: true };
  }

  async retryWebhook(params: { provider: string; eventId: string }) {
    const provider = params.provider.toUpperCase();
    if (provider !== 'STRIPE' && provider !== 'MERCADOPAGO' && provider !== 'HOTMART') {
      throw new BadRequestException('Provider inválido');
    }

    const row = await this.prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: provider as never, eventId: params.eventId } },
      select: { id: true, provider: true, eventId: true, payload: true },
    });
    if (!row) throw new BadRequestException('Webhook não encontrado');

    if (provider === 'STRIPE') {
      const tenantId = await this.resolveTenantIdFromEvent(row.payload);
      await this.processStripeEvent({ tenantId, event: row.payload });
      await this.prisma.webhookEvent.update({
        where: { provider_eventId: { provider: 'STRIPE', eventId: row.eventId } },
        data: { status: 'PROCESSED', processedAt: new Date(), error: null },
      });
      return { ok: true };
    }

    if (provider === 'MERCADOPAGO') {
      await this.processMercadoPagoEvent({ eventId: row.eventId });
      await this.prisma.webhookEvent.update({
        where: { provider_eventId: { provider: 'MERCADOPAGO', eventId: row.eventId } },
        data: { status: 'PROCESSED', processedAt: new Date(), error: null },
      });
      return { ok: true };
    }

    await this.processHotmartEvent({ payload: row.payload, eventId: row.eventId });
    await this.prisma.webhookEvent.update({
      where: { provider_eventId: { provider: 'HOTMART', eventId: row.eventId } },
      data: { status: 'PROCESSED', processedAt: new Date(), error: null },
    });
    return { ok: true };
  }

  private async processStripeEvent(params: { tenantId: string; event: unknown }) {
    const type = (params.event as any).type;

    if (type === 'checkout.session.completed') {
      const session = (params.event as any).data.object as any;
      const orderId = session.client_reference_id || session.metadata?.orderId;
      if (!orderId) return;

      await this.markOrderPaid({
        tenantId: params.tenantId,
        orderId,
        provider: 'STRIPE',
        providerCheckoutRef: session.id,
        providerPaymentRef: session.payment_intent?.toString(),
      });
    }
  }

  private async markOrderPaid(params: {
    tenantId: string;
    orderId: string;
    provider: 'STRIPE' | 'MERCADOPAGO' | 'HOTMART';
    providerCheckoutRef?: string;
    providerPaymentRef?: string;
    amountCents?: number;
    currency?: string;
  }) {
    const order = await this.prisma.order.findFirst({
      where: { tenantId: params.tenantId, id: params.orderId },
      select: { id: true, userId: true, status: true, totalCents: true, currency: true, items: { select: { product: { select: { id: true, type: true, metadata: true } } } } },
    });
    if (!order) return;
    if (order.status === 'PAID') return;

    if (typeof params.amountCents === 'number' && params.amountCents !== order.totalCents) {
      throw new BadRequestException('Valor divergente');
    }
    if (typeof params.currency === 'string' && params.currency.toUpperCase() !== order.currency.toUpperCase()) {
      throw new BadRequestException('Moeda divergente');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'PAID', providerCheckoutRef: params.providerCheckoutRef ?? undefined },
      });

      if (params.providerPaymentRef) {
        const existing = await tx.payment.findUnique({
          where: { providerPaymentRef: params.providerPaymentRef },
          select: { id: true },
        });
        if (!existing) {
          await tx.payment.create({
            data: {
              tenantId: params.tenantId,
              orderId: order.id,
              provider: params.provider,
              status: 'SUCCEEDED',
              providerPaymentRef: params.providerPaymentRef,
              providerEventRef: params.providerCheckoutRef ?? null,
              amountCents: order.totalCents,
              currency: order.currency,
            },
          });
        }
      }

      for (const item of order.items) {
        await this.grantFromProduct(tx, params.tenantId, order.userId, order.id, item.product.type, item.product.metadata);
      }

      await tx.auditLog.create({
        data: {
          tenantId: params.tenantId,
          actorUserId: order.userId,
          action: 'PAYMENT_SUCCEEDED',
          targetType: 'Order',
          targetId: order.id,
          metadata: { provider: params.provider, providerCheckoutRef: params.providerCheckoutRef ?? null, providerPaymentRef: params.providerPaymentRef ?? null },
        },
        select: { id: true },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: params.tenantId,
          topic: 'order.paid',
          payload: {
            orderId: order.id,
            userId: order.userId,
            provider: params.provider,
            totalCents: order.totalCents,
            currency: order.currency,
            items: order.items.map((i) => ({ productType: i.product.type, metadata: i.product.metadata })),
          },
          dedupeKey: `order.paid:${order.id}`,
        },
        select: { id: true },
      });

      await tx.analyticsEvent.create({
        data: {
          tenantId: params.tenantId,
          userId: order.userId,
          name: 'purchase.paid',
          properties: { orderId: order.id, provider: params.provider, totalCents: order.totalCents, currency: order.currency } as never,
        },
        select: { id: true },
      });
    });
  }

  private async grantFromProduct(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    sourceRef: string,
    type: string,
    metadata: unknown,
  ) {
    const meta = (metadata ?? {}) as Record<string, unknown>;
    const resourceId = typeof meta.resourceId === 'string' ? meta.resourceId : null;

    if (type === 'MEMBERSHIP') {
      await tx.entitlement.upsert({
        where: { userId_resourceType_resourceId: { userId, resourceType: 'TENANT', resourceId: tenantId } },
        update: { revokedAt: null, sourceRef },
        create: { tenantId, userId, resourceType: 'TENANT', resourceId: tenantId, sourceType: 'PURCHASE', sourceRef },
      });
      return;
    }

    if (!resourceId) return;

    if (type === 'COURSE') {
      await tx.entitlement.upsert({
        where: { userId_resourceType_resourceId: { userId, resourceType: 'COURSE', resourceId } },
        update: { revokedAt: null, sourceRef },
        create: { tenantId, userId, resourceType: 'COURSE', resourceId, sourceType: 'PURCHASE', sourceRef },
      });
      return;
    }

    if (type === 'EBOOK') {
      await tx.entitlement.upsert({
        where: { userId_resourceType_resourceId: { userId, resourceType: 'EBOOK', resourceId } },
        update: { revokedAt: null, sourceRef },
        create: { tenantId, userId, resourceType: 'EBOOK', resourceId, sourceType: 'PURCHASE', sourceRef },
      });
      await tx.libraryItem.upsert({
        where: { userId_ebookId: { userId, ebookId: resourceId } },
        update: { revokedAt: null, sourceRef },
        create: { tenantId, userId, ebookId: resourceId, sourceType: 'PURCHASE', sourceRef },
      });
      return;
    }

    if (type === 'MENTORSHIP') {
      await tx.entitlement.upsert({
        where: { userId_resourceType_resourceId: { userId, resourceType: 'MENTORSHIP_OFFER', resourceId } },
        update: { revokedAt: null, sourceRef },
        create: { tenantId, userId, resourceType: 'MENTORSHIP_OFFER', resourceId, sourceType: 'PURCHASE', sourceRef },
      });
      await tx.mentorshipEnrollment.upsert({
        where: { userId_offerId: { userId, offerId: resourceId } },
        update: { unlockedAt: new Date(), revokedAt: null },
        create: { tenantId, userId, offerId: resourceId, unlockedAt: new Date() },
      });
      await tx.outboxEvent.create({
        data: { tenantId, topic: 'mentorship.unlocked', payload: { userId, offerId: resourceId, sourceRef }, dedupeKey: `mentorship.unlocked:${userId}:${resourceId}:${sourceRef}` },
        select: { id: true },
      });
    }
  }

  private async processMercadoPagoEvent(params: { eventId: string }) {
    const accessToken = this.config.get<string>('MERCADOPAGO_ACCESS_TOKEN') || '';
    if (!accessToken) throw new Error('Mercado Pago não configurado');

    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(params.eventId)}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) throw new BadRequestException('Falha ao validar pagamento');
    const payment = (await resp.json()) as any;

    const orderId = typeof payment.external_reference === 'string' ? payment.external_reference : null;
    if (!orderId) {
      await this.prisma.webhookEvent.update({
        where: { provider_eventId: { provider: 'MERCADOPAGO', eventId: params.eventId } },
        data: { status: 'IGNORED', processedAt: new Date(), error: 'external_reference ausente' },
      });
      return;
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId },
      select: { id: true, tenantId: true, userId: true, totalCents: true, currency: true },
    });
    if (!order) return;

    await this.prisma.webhookEvent.update({
      where: { provider_eventId: { provider: 'MERCADOPAGO', eventId: params.eventId } },
      data: { tenantId: order.tenantId },
    });

    const amountCents = typeof payment.transaction_amount === 'number' ? Math.round(payment.transaction_amount * 100) : null;
    const currency = typeof payment.currency_id === 'string' ? payment.currency_id : null;

    const status = typeof payment.status === 'string' ? payment.status : '';
    if (status === 'approved') {
      await this.markOrderPaid({
        tenantId: order.tenantId,
        orderId: order.id,
        provider: 'MERCADOPAGO',
        providerCheckoutRef: typeof payment.order?.id === 'number' ? payment.order.id.toString() : undefined,
        providerPaymentRef: typeof payment.id === 'number' ? payment.id.toString() : typeof payment.id === 'string' ? payment.id : undefined,
        amountCents: amountCents ?? undefined,
        currency: currency ?? undefined,
      });
      return;
    }

    if (status === 'refunded') {
      await this.prisma.order.update({ where: { id: order.id }, data: { status: 'REFUNDED' } });
      return;
    }

    await this.prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
  }

  private async processHotmartEvent(params: { payload: unknown; eventId: string }) {
    const body = (params.payload ?? {}) as any;
    const event = (body.event ?? body.type ?? body.name ?? '') as string;
    const status = ((body.data?.purchase?.status ?? body.purchase?.status ?? '') as string).toLowerCase();

    const orderId =
      (body.data?.purchase?.external_reference as string) ||
      (body.purchase?.external_reference as string) ||
      (body.data?.purchase?.src as string) ||
      (body.src as string) ||
      null;

    if (!orderId || typeof orderId !== 'string') {
      await this.prisma.webhookEvent.update({
        where: { provider_eventId: { provider: 'HOTMART', eventId: params.eventId } },
        data: { status: 'IGNORED', processedAt: new Date(), error: 'orderId ausente' },
      });
      return;
    }

    const order = await this.prisma.order.findFirst({ where: { id: orderId }, select: { id: true, tenantId: true } });
    if (!order) return;

    await this.prisma.webhookEvent.update({
      where: { provider_eventId: { provider: 'HOTMART', eventId: params.eventId } },
      data: { tenantId: order.tenantId },
    });

    const approved = event.toUpperCase().includes('APPROVED') || status === 'approved' || status === 'completed';
    const refunded = event.toUpperCase().includes('REFUND') || status === 'refunded' || status === 'chargeback';

    const transaction =
      (body.data?.purchase?.transaction as string) ||
      (body.purchase?.transaction as string) ||
      (body.data?.purchase?.transaction_id as string) ||
      null;

    if (approved) {
      await this.markOrderPaid({
        tenantId: order.tenantId,
        orderId: order.id,
        provider: 'HOTMART',
        providerCheckoutRef: params.eventId,
        providerPaymentRef: typeof transaction === 'string' ? transaction : undefined,
      });
      return;
    }

    if (refunded) {
      await this.prisma.order.update({ where: { id: order.id }, data: { status: 'REFUNDED' } });
      return;
    }

    await this.prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
  }

  private async processPandaVideoEvent(params: { payload: unknown }): Promise<{ tenantId?: string }> {
    const body = (params.payload ?? {}) as any;
    const pandaVideoId =
      (typeof body.video_id === 'string' && body.video_id) ||
      (typeof body.videoId === 'string' && body.videoId) ||
      (typeof body.video?.id === 'string' && body.video.id) ||
      null;

    if (!pandaVideoId) return {};

    const durationSecRaw =
      (typeof body.duration === 'number' && body.duration) ||
      (typeof body.video?.duration === 'number' && body.video.duration) ||
      (typeof body.video?.duration_in_seconds === 'number' && body.video.duration_in_seconds) ||
      null;
    const durationSec = typeof durationSecRaw === 'number' ? Math.max(0, Math.floor(durationSecRaw)) : undefined;

    const updated = await this.prisma.lessonVideo.updateMany({
      where: { pandaVideoId },
      data: {
        durationSec: durationSec ?? undefined,
        metadata: body as never,
      },
    });

    if (updated.count === 0) return {};

    const row = await this.prisma.lessonVideo.findFirst({
      where: { pandaVideoId },
      select: { tenantId: true },
    });
    return { tenantId: row?.tenantId ?? undefined };
  }

  private extractMercadoPagoEventId(body: unknown, query: Record<string, unknown>) {
    const q = (query ?? {}) as any;
    const fromQuery = q.id ?? q['data.id'] ?? (q.data && q.data.id);
    if (fromQuery) return fromQuery.toString();

    const b = (body ?? {}) as any;
    const id = b.id ?? b.data?.id ?? b['data.id'];
    if (!id) return null;
    return id.toString();
  }

  private extractHotmartEventId(body: unknown) {
    const b = (body ?? {}) as any;
    const id = b.id ?? b.event_id ?? b.data?.purchase?.transaction ?? b.purchase?.transaction;
    if (!id) return null;
    return id.toString();
  }

  private extractPandaVideoEventId(body: unknown) {
    const b = (body ?? {}) as any;
    const id = b.id ?? b.event_id ?? b.eventId ?? b.webhook_id ?? b.webhookId;
    if (!id) return null;
    return id.toString();
  }

  private async resolveDefaultTenant() {
    const t = await this.tenantService.getDefaultTenant();
    if (!t) throw new Error('Tenant default não encontrado');
    return { tenantId: t.id };
  }

  private async resolveTenantIdFromEvent(event: unknown) {
    const session = (event as any).data.object as any;
    const metaTenantId = session.metadata?.tenantId;
    if (typeof metaTenantId === 'string' && metaTenantId) return metaTenantId;

    const t = await this.tenantService.getDefaultTenant();
    if (!t) throw new Error('Tenant default não encontrado');
    return t.id;
  }
}
