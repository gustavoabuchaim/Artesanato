import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { BruteForceService } from '../../security/bruteforce.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly bruteForce: BruteForceService,
    private readonly logger: PinoLogger,
  ) {}

  async createCheckout(params: {
    tenantId: string;
    userId: string;
    priceId: string;
    provider?: string;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey?: string;
    ip?: string;
    userAgent?: string;
  }) {
    const provider = (params.provider ?? 'STRIPE').toUpperCase();

    const bfKey = `bf:checkout:${params.tenantId}:${params.userId}:${provider}:${params.ip ?? ''}`;
    await this.bruteForce.assertAllowed(bfKey);

    const recentPending = await this.prisma.order.count({
      where: { tenantId: params.tenantId, userId: params.userId, status: 'PENDING', createdAt: { gt: new Date(Date.now() - 10 * 60_000) } },
    });
    if (recentPending >= 5) {
      await this.bruteForce.recordFailure(bfKey);
      throw new BadRequestException('Muitas tentativas. Aguarde alguns minutos.');
    }

    const price = await this.prisma.price.findFirst({
      where: { tenantId: params.tenantId, id: params.priceId, isActive: true },
      select: {
        id: true,
        amountCents: true,
        currency: true,
        product: { select: { id: true, name: true, type: true, metadata: true } },
      },
    });
    if (!price) throw new BadRequestException('Preço inválido');

    const order = await this.prisma.order.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        status: 'PENDING',
        currency: price.currency,
        totalCents: price.amountCents,
        metadata: {
          providerRequested: provider,
          idempotencyKey: params.idempotencyKey ?? null,
          ip: params.ip ?? null,
          userAgent: params.userAgent ?? null,
        },
        items: {
          create: [
            {
              tenantId: params.tenantId,
              productId: price.product.id,
              priceId: price.id,
              quantity: 1,
              unitAmountCents: price.amountCents,
              currency: price.currency,
              snapshot: { productName: price.product.name, productType: price.product.type, priceId: price.id },
            },
          ],
        },
      },
      select: { id: true },
    });

    await this.prisma.analyticsEvent.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        name: 'purchase.checkout_created',
        properties: {
          orderId: order.id,
          providerRequested: provider,
          priceId: price.id,
          productId: price.product.id,
          productType: price.product.type,
          amountCents: price.amountCents,
          currency: price.currency,
        } as never,
        userAgent: params.userAgent ?? null,
        ip: params.ip ?? null,
      },
      select: { id: true },
    });

    try {
      if (provider === 'STRIPE') {
        const result = await this.createStripeCheckout({
          tenantId: params.tenantId,
          userId: params.userId,
          orderId: order.id,
          productName: price.product.name,
          currency: price.currency,
          amountCents: price.amountCents,
          successUrl: params.successUrl,
          cancelUrl: params.cancelUrl,
          productMetadata: price.product.metadata,
        });
        await this.bruteForce.reset(bfKey);
        return result;
      }

      if (provider === 'MERCADOPAGO') {
        const result = await this.createMercadoPagoCheckout({
          tenantId: params.tenantId,
          userId: params.userId,
          orderId: order.id,
          productName: price.product.name,
          currency: price.currency,
          amountCents: price.amountCents,
          successUrl: params.successUrl,
          cancelUrl: params.cancelUrl,
        });
        await this.bruteForce.reset(bfKey);
        return result;
      }

      if (provider === 'HOTMART') {
        const raw = (price.product.metadata ?? {}) as Record<string, unknown>;
        const url = typeof raw.hotmartCheckoutUrl === 'string' ? raw.hotmartCheckoutUrl : '';
        if (!url) throw new BadRequestException('Checkout Hotmart não configurado no produto');

        const join = url.includes('?') ? '&' : '?';
        const checkoutUrl = `${url}${join}src=${encodeURIComponent(order.id)}`;

        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            metadata: {
              providerRequested: 'HOTMART',
              idempotencyKey: params.idempotencyKey ?? null,
              ip: params.ip ?? null,
              userAgent: params.userAgent ?? null,
              hotmart: { checkoutUrl },
            } as never,
          },
          select: { id: true },
        });

        await this.logFinancial({
          tenantId: params.tenantId,
          actorUserId: params.userId,
          action: 'PAYMENT_CHECKOUT_CREATED',
          targetType: 'Order',
          targetId: order.id,
          metadata: { provider: 'HOTMART' },
        });

        await this.bruteForce.reset(bfKey);
        return { checkoutUrl, orderId: order.id };
      }

      throw new BadRequestException('Provider inválido');
    } catch (e) {
      await this.bruteForce.recordFailure(bfKey);
      this.logger.error({ event: 'payments.checkout_failed', tenantId: params.tenantId, userId: params.userId, provider }, 'Checkout failed');
      throw e;
    }
  }

  async listMyOrders(tenantId: string, userId: string) {
    return this.prisma.order.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        totalCents: true,
        currency: true,
        createdAt: true,
        items: { select: { product: { select: { name: true, type: true } }, quantity: true } },
        payments: { select: { status: true, provider: true, createdAt: true } },
      },
    });
  }

  async cancelOrder(params: { tenantId: string; userId: string; orderId: string }) {
    const order = await this.prisma.order.findFirst({
      where: { tenantId: params.tenantId, id: params.orderId, userId: params.userId },
      select: { id: true, status: true, providerCheckoutRef: true, metadata: true },
    });
    if (!order) throw new BadRequestException('Pedido não encontrado');
    if (order.status !== 'PENDING') return { ok: true };

    await this.prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELED' }, select: { id: true } });

    const provider = this.orderProvider(order.metadata);
    if (provider === 'STRIPE' && order.providerCheckoutRef) {
      try {
        const stripe = this.getStripe();
        await stripe.checkout.sessions.expire(order.providerCheckoutRef);
      } catch {}
    }

    return { ok: true };
  }

  async refundOrder(params: { tenantId: string; actorUserId: string; orderId: string; ip?: string; userAgent?: string }) {
    const order = await this.prisma.order.findFirst({
      where: { tenantId: params.tenantId, id: params.orderId },
      select: { id: true, userId: true, status: true, providerCheckoutRef: true, totalCents: true, currency: true, items: { select: { product: { select: { type: true, metadata: true } } } } },
    });
    if (!order) throw new BadRequestException('Pedido não encontrado');
    if (order.status !== 'PAID' && order.status !== 'REFUNDED') throw new BadRequestException('Pedido não está pago');
    if (order.status === 'REFUNDED') return { ok: true };

    const payment = await this.prisma.payment.findFirst({
      where: { tenantId: params.tenantId, orderId: order.id, status: 'SUCCEEDED' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, provider: true, providerPaymentRef: true },
    });
    if (!payment) throw new BadRequestException('Pagamento não encontrado');

    if (payment.provider === 'STRIPE') {
      const stripe = this.getStripe();
      if (!payment.providerPaymentRef) throw new BadRequestException('Pagamento Stripe sem referência');
      await stripe.refunds.create({ payment_intent: payment.providerPaymentRef });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: 'REFUNDED' } });
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });

      for (const item of order.items) {
        await this.revokePurchasedResources(tx, params.tenantId, order.userId, order.id, item.product.type, item.product.metadata);
      }

      await tx.auditLog.create({
        data: {
          tenantId: params.tenantId,
          actorUserId: params.actorUserId,
          action: 'PAYMENT_REFUNDED',
          targetType: 'Order',
          targetId: order.id,
          metadata: { provider: payment.provider, amountCents: order.totalCents, currency: order.currency, ip: params.ip, userAgent: params.userAgent },
        },
        select: { id: true },
      });
    });

    await this.prisma.analyticsEvent.create({
      data: {
        tenantId: params.tenantId,
        userId: params.actorUserId,
        name: 'purchase.refunded',
        properties: { orderId: order.id, provider: payment.provider, amountCents: order.totalCents, currency: order.currency } as never,
        userAgent: params.userAgent ?? null,
        ip: params.ip ?? null,
      },
      select: { id: true },
    });

    return { ok: true };
  }

  async syncOrderPayment(params: { tenantId: string; orderId: string }) {
    const order = await this.prisma.order.findFirst({
      where: { tenantId: params.tenantId, id: params.orderId },
      select: { id: true, status: true, providerCheckoutRef: true, currency: true, totalCents: true, userId: true, items: { select: { product: { select: { type: true, metadata: true } } } } },
    });
    if (!order) throw new BadRequestException('Pedido não encontrado');

    if (order.providerCheckoutRef?.startsWith('cs_')) {
      const stripe = this.getStripe();
      const session = await stripe.checkout.sessions.retrieve(order.providerCheckoutRef);

      const paid = session.payment_status === 'paid' || session.status === 'complete';
      const expired = session.status === 'expired';

      if (paid && order.status !== 'PAID') {
        await this.prisma.$transaction(async (tx) => {
          await tx.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
          await tx.payment.create({
            data: {
              tenantId: params.tenantId,
              orderId: order.id,
              provider: 'STRIPE',
              status: 'SUCCEEDED',
              providerPaymentRef: (session.payment_intent ?? null) as any,
              providerEventRef: session.id,
              amountCents: order.totalCents,
              currency: order.currency,
            },
          });
          for (const item of order.items) {
            await this.grantFromProduct(tx, params.tenantId, order.userId, order.id, item.product.type, item.product.metadata);
          }
          await tx.outboxEvent.create({
            data: {
              tenantId: params.tenantId,
              topic: 'order.paid',
              payload: {
                orderId: order.id,
                userId: order.userId,
                provider: 'STRIPE',
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
              properties: { orderId: order.id, provider: 'STRIPE', totalCents: order.totalCents, currency: order.currency } as never,
            },
            select: { id: true },
          });
        });
        return { ok: true, status: 'PAID' };
      }

      if (expired && order.status === 'PENDING') {
        await this.prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELED' } });
        return { ok: true, status: 'CANCELED' };
      }
    }

    return { ok: true, status: order.status };
  }

  private getStripe() {
    const stripeKey = this.config.get<string>('STRIPE_SECRET_KEY') || '';
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY não configurado');
    return new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' });
  }

  private async createStripeCheckout(params: {
    tenantId: string;
    userId: string;
    orderId: string;
    productName: string;
    currency: string;
    amountCents: number;
    successUrl: string;
    cancelUrl: string;
    productMetadata: unknown;
  }) {
    const stripe = this.getStripe();

    const meta = (params.productMetadata ?? {}) as Record<string, unknown>;
    const connect = (meta.connect ?? {}) as Record<string, unknown>;
    const destinationAccountId = typeof connect.destinationAccountId === 'string' ? connect.destinationAccountId : null;
    const applicationFeeBps = typeof connect.applicationFeeBps === 'number' ? connect.applicationFeeBps : null;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.orderId,
      metadata: { orderId: params.orderId, tenantId: params.tenantId, userId: params.userId },
      ...(destinationAccountId && applicationFeeBps !== null
        ? {
            payment_intent_data: {
              transfer_data: { destination: destinationAccountId },
              application_fee_amount: Math.max(0, Math.floor((params.amountCents * applicationFeeBps) / 10_000)),
            },
          }
        : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: params.currency.toLowerCase(),
            unit_amount: params.amountCents,
            product_data: { name: params.productName },
          },
        },
      ],
    });

    await this.prisma.order.update({
      where: { id: params.orderId },
      data: { providerCheckoutRef: session.id },
      select: { id: true },
    });

    await this.logFinancial({
      tenantId: params.tenantId,
      actorUserId: params.userId,
      action: 'PAYMENT_CHECKOUT_CREATED',
      targetType: 'Order',
      targetId: params.orderId,
      metadata: { provider: 'STRIPE', checkoutRef: session.id },
    });

    return { checkoutUrl: session.url, orderId: params.orderId };
  }

  private async createMercadoPagoCheckout(params: {
    tenantId: string;
    userId: string;
    orderId: string;
    productName: string;
    currency: string;
    amountCents: number;
    successUrl: string;
    cancelUrl: string;
  }) {
    const accessToken = this.config.get<string>('MERCADOPAGO_ACCESS_TOKEN') || '';
    if (!accessToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado');

    const unitPrice = Math.round(params.amountCents) / 100;
    const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        external_reference: params.orderId,
        items: [{ title: params.productName, quantity: 1, unit_price: unitPrice, currency_id: params.currency }],
        back_urls: { success: params.successUrl, failure: params.cancelUrl, pending: params.cancelUrl },
        auto_return: 'approved',
      }),
    });
    if (!resp.ok) throw new BadRequestException('Falha ao criar checkout');
    const json = (await resp.json()) as any;

    const preferenceId = typeof json.id === 'string' ? json.id : null;
    const checkoutUrl = typeof json.init_point === 'string' ? json.init_point : null;
    if (!preferenceId || !checkoutUrl) throw new BadRequestException('Falha ao criar checkout');

    await this.prisma.order.update({
      where: { id: params.orderId },
      data: { providerCheckoutRef: preferenceId },
      select: { id: true },
    });

    await this.logFinancial({
      tenantId: params.tenantId,
      actorUserId: params.userId,
      action: 'PAYMENT_CHECKOUT_CREATED',
      targetType: 'Order',
      targetId: params.orderId,
      metadata: { provider: 'MERCADOPAGO', checkoutRef: preferenceId },
    });

    return { checkoutUrl, orderId: params.orderId };
  }

  private orderProvider(metadata: unknown): 'STRIPE' | 'MERCADOPAGO' | 'HOTMART' | null {
    const meta = (metadata ?? {}) as Record<string, unknown>;
    const raw = typeof meta.providerRequested === 'string' ? meta.providerRequested.toUpperCase() : '';
    if (raw === 'STRIPE' || raw === 'MERCADOPAGO' || raw === 'HOTMART') return raw;
    return null;
  }

  private async logFinancial(params: {
    tenantId: string;
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        metadata: params.metadata ? (params.metadata as Prisma.InputJsonValue) : undefined,
      },
      select: { id: true },
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

  private async revokePurchasedResources(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    sourceRef: string,
    type: string,
    metadata: unknown,
  ) {
    const meta = (metadata ?? {}) as Record<string, unknown>;
    const resourceId = typeof meta.resourceId === 'string' ? meta.resourceId : null;
    const now = new Date();

    if (type === 'MEMBERSHIP') {
      await tx.entitlement.updateMany({
        where: { tenantId, userId, resourceType: 'TENANT', resourceId: tenantId, sourceType: 'PURCHASE', sourceRef },
        data: { revokedAt: now },
      });
      return;
    }

    if (!resourceId) return;

    if (type === 'COURSE') {
      await tx.entitlement.updateMany({
        where: { tenantId, userId, resourceType: 'COURSE', resourceId, sourceType: 'PURCHASE', sourceRef },
        data: { revokedAt: now },
      });
      return;
    }

    if (type === 'EBOOK') {
      await tx.entitlement.updateMany({
        where: { tenantId, userId, resourceType: 'EBOOK', resourceId, sourceType: 'PURCHASE', sourceRef },
        data: { revokedAt: now },
      });
      await tx.libraryItem.updateMany({ where: { tenantId, userId, ebookId: resourceId, sourceType: 'PURCHASE', sourceRef }, data: { revokedAt: now } });
      return;
    }

    if (type === 'MENTORSHIP') {
      await tx.entitlement.updateMany({
        where: { tenantId, userId, resourceType: 'MENTORSHIP_OFFER', resourceId, sourceType: 'PURCHASE', sourceRef },
        data: { revokedAt: now },
      });
      await tx.mentorshipEnrollment.updateMany({ where: { tenantId, userId, offerId: resourceId }, data: { revokedAt: now } });
    }
  }
}
