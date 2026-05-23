import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from './email.service';
import { emailLayout, textTemplate } from './email.templates';

type OutboxRow = {
  id: string;
  tenantId: string;
  topic: string;
  status: 'PENDING' | 'DISPATCHED' | 'FAILED';
  payload: unknown;
  dedupeKey: string | null;
  createdAt: Date;
  dispatchedAt: Date | null;
  attempts: number;
  lastError: string | null;
};

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly logger: PinoLogger,
  ) {}

  onModuleInit() {
    const enabled = this.config.get<boolean>('OUTBOX_ENABLED') ?? true;
    if (!enabled) return;
    const intervalMs = this.config.get<number>('OUTBOX_POLL_INTERVAL_MS') ?? 5000;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private appUrl() {
    const raw = (this.config.get<string>('APP_PUBLIC_URL') ?? 'http://localhost:3000').trim();
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
  }

  private nextDelayMs(attempts: number) {
    const base = 30_000;
    const max = 15 * 60_000;
    const pow = Math.max(0, Math.min(20, attempts));
    return Math.min(base * 2 ** pow, max);
  }

  private isDue(row: OutboxRow) {
    if (!row.dispatchedAt) return true;
    const delay = this.nextDelayMs(row.attempts);
    return Date.now() - row.dispatchedAt.getTime() >= delay;
  }

  private truncate(value: string, max = 900) {
    const trimmed = value.trim();
    return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.processBatch();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'erro';
      this.logger.warn({ event: 'outbox.tick_failed', error: message }, 'Outbox tick failed');
    } finally {
      this.running = false;
    }
  }

  private async processBatch() {
    const batchSize = this.config.get<number>('OUTBOX_BATCH_SIZE') ?? 25;
    const maxAttempts = this.config.get<number>('OUTBOX_MAX_ATTEMPTS') ?? 8;

    const rows = await this.prisma.outboxEvent.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        attempts: { lt: maxAttempts },
      },
      orderBy: { createdAt: 'asc' },
      take: Math.max(batchSize * 3, batchSize),
      select: {
        id: true,
        tenantId: true,
        topic: true,
        status: true,
        payload: true,
        dedupeKey: true,
        createdAt: true,
        dispatchedAt: true,
        attempts: true,
        lastError: true,
      },
    });

    const due = rows.filter((r) => this.isDue(r as OutboxRow)).slice(0, batchSize) as OutboxRow[];
    if (!due.length) return;

    for (const row of due) {
      await this.processOne(row);
    }
  }

  private async processOne(row: OutboxRow) {
    const startedAt = Date.now();
    const claim = await this.prisma.outboxEvent.updateMany({
      where: {
        id: row.id,
        status: { in: ['PENDING', 'FAILED'] },
        attempts: row.attempts,
        dispatchedAt: row.dispatchedAt ?? null,
      },
      data: { status: 'PENDING', dispatchedAt: new Date() },
    });
    if (!claim.count) return;

    try {
      await this.handleTopic(row);
      await this.prisma.outboxEvent.update({
        where: { id: row.id },
        data: { status: 'DISPATCHED', dispatchedAt: new Date(), lastError: null },
        select: { id: true },
      });
      this.logger.info(
        { event: 'outbox.dispatched', outboxEventId: row.id, topic: row.topic, tenantId: row.tenantId, ms: Date.now() - startedAt },
        'Outbox dispatched',
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : 'erro';
      await this.prisma.outboxEvent.update({
        where: { id: row.id },
        data: { status: 'FAILED', dispatchedAt: new Date(), attempts: row.attempts + 1, lastError: this.truncate(message) },
        select: { id: true },
      });
      this.logger.warn(
        { event: 'outbox.failed', outboxEventId: row.id, topic: row.topic, tenantId: row.tenantId, attempts: row.attempts + 1, error: message },
        'Outbox failed',
      );
    }
  }

  private async upsertEmailLog(params: { outboxEventId: string; tenantId: string; userId: string; type: string; title?: string; body?: string }) {
    await this.prisma.notification.upsert({
      where: { id: params.outboxEventId },
      update: { type: params.type, title: params.title ?? null, body: params.body ?? null },
      create: {
        id: params.outboxEventId,
        tenantId: params.tenantId,
        userId: params.userId,
        channel: 'EMAIL',
        status: 'PENDING',
        type: params.type,
        title: params.title ?? null,
        body: params.body ?? null,
        payload: { outboxEventId: params.outboxEventId },
      },
      select: { id: true },
    });
  }

  private async markEmailLog(params: { outboxEventId: string; status: 'SENT' | 'FAILED'; providerMessageId?: string; error?: string }) {
    const payload: Record<string, unknown> = { outboxEventId: params.outboxEventId };
    if (params.providerMessageId) payload.providerMessageId = params.providerMessageId;
    if (params.error) payload.error = this.truncate(params.error, 1800);

    await this.prisma.notification.updateMany({
      where: { id: params.outboxEventId },
      data: {
        status: params.status,
        sentAt: params.status === 'SENT' ? new Date() : undefined,
        payload: payload as never,
      },
    });
  }

  private async handleTopic(row: OutboxRow) {
    const topic = row.topic;
    const payload = (row.payload ?? {}) as any;

    if (topic === 'user.registered') {
      const userId = payload.userId as string;
      if (!userId) throw new Error('missing_user_id');
      const user = await this.prisma.user.findFirst({ where: { tenantId: row.tenantId, id: userId }, select: { id: true, email: true, name: true } });
      if (!user) return;

      const ctaUrl = `${this.appUrl()}/membros/onboarding`;
      const html = emailLayout({
        preheader: 'Bem-vinda à Comunidade AI',
        title: 'Bem-vinda à Comunidade AI',
        subtitle: user.name ? `Olá, ${user.name}!` : 'Olá!',
        bodyHtml: `<p style="margin:0 0 12px 0">Seu acesso foi criado com sucesso. Agora você já pode entrar na área de membros, completar seu onboarding e participar da comunidade.</p>
<p style="margin:0">Se precisar de ajuda, responda este email.</p>`,
        ctaText: 'Começar agora',
        ctaUrl,
      });
      const text = textTemplate({
        title: 'Bem-vinda à Comunidade AI',
        lines: ['Seu acesso foi criado com sucesso.', 'Complete seu onboarding e participe da comunidade.'],
        ctaText: 'Começar agora',
        ctaUrl,
      });

      await this.upsertEmailLog({ outboxEventId: row.id, tenantId: row.tenantId, userId: user.id, type: 'email.welcome', title: 'Bem-vinda', body: 'Email de boas-vindas' });
      try {
        const sent = await this.email.send({ to: user.email, subject: 'Bem-vinda à Comunidade AI', html, text, idempotencyKey: row.id });
        await this.markEmailLog({ outboxEventId: row.id, status: 'SENT', providerMessageId: sent.id });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'erro';
        await this.markEmailLog({ outboxEventId: row.id, status: 'FAILED', error: message });
        throw e;
      }
      return;
    }

    if (topic === 'user.password_reset_requested') {
      const userId = payload.userId as string;
      const token = payload.token as string;
      if (!userId || !token) throw new Error('missing_payload');
      const user = await this.prisma.user.findFirst({ where: { tenantId: row.tenantId, id: userId }, select: { id: true, email: true, name: true } });
      if (!user) return;

      const ctaUrl = `${this.appUrl()}/redefinir-senha?token=${encodeURIComponent(token)}`;
      const html = emailLayout({
        preheader: 'Recupere seu acesso com segurança',
        title: 'Recuperação de senha',
        subtitle: user.name ? `Olá, ${user.name}!` : 'Olá!',
        bodyHtml: `<p style="margin:0 0 12px 0">Recebemos um pedido para redefinir sua senha. Para continuar, clique no botão abaixo.</p>
<p style="margin:0 0 12px 0;color:#6b7280">Este link expira em 30 minutos.</p>`,
        ctaText: 'Redefinir senha',
        ctaUrl,
      });
      const text = textTemplate({
        title: 'Recuperação de senha',
        lines: ['Recebemos um pedido para redefinir sua senha.', 'Este link expira em 30 minutos.'],
        ctaText: 'Redefinir senha',
        ctaUrl,
      });

      await this.upsertEmailLog({ outboxEventId: row.id, tenantId: row.tenantId, userId: user.id, type: 'email.password_reset', title: 'Recuperação de senha', body: 'Pedido de redefinição de senha' });
      try {
        const sent = await this.email.send({ to: user.email, subject: 'Recuperação de senha — Comunidade AI', html, text, idempotencyKey: row.id });
        await this.markEmailLog({ outboxEventId: row.id, status: 'SENT', providerMessageId: sent.id });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'erro';
        await this.markEmailLog({ outboxEventId: row.id, status: 'FAILED', error: message });
        throw e;
      }
      return;
    }

    if (topic === 'waitlist.subscribed') {
      const email = (payload.email as string) || '';
      const name = (payload.name as string) || '';
      if (!email) throw new Error('missing_email');

      const ctaUrl = `${this.appUrl()}/`;
      const html = emailLayout({
        preheader: 'Você será avisada assim que abrirmos',
        title: 'Você está na lista',
        subtitle: name ? `Olá, ${name}!` : 'Olá!',
        bodyHtml: `<p style="margin:0 0 12px 0">Recebemos seu pedido de “quero ser avisada”. Assim que houver novidades, você será a primeira a saber.</p>
<p style="margin:0;color:#6b7280">Guarde este email para referência.</p>`,
        ctaText: 'Conhecer a Comunidade AI',
        ctaUrl,
      });
      const text = textTemplate({
        title: 'Você está na lista',
        lines: ['Recebemos seu pedido de “quero ser avisada”.', 'Assim que houver novidades, você será avisada.'],
        ctaText: 'Conhecer a Comunidade AI',
        ctaUrl,
      });

      await this.email.send({ to: email, subject: 'Você está na lista — Comunidade AI', html, text, idempotencyKey: row.id });
      return;
    }

    if (topic === 'order.paid') {
      const orderId = payload.orderId as string;
      const userId = payload.userId as string;
      if (!orderId || !userId) throw new Error('missing_payload');

      const user = await this.prisma.user.findFirst({ where: { tenantId: row.tenantId, id: userId }, select: { id: true, email: true, name: true } });
      if (!user) return;

      const items = Array.isArray(payload.items) ? payload.items : [];
      const itemsHtml = items.length
        ? `<ul style="margin:12px 0 0 18px;padding:0;color:#111827">${items
            .slice(0, 8)
            .map((i: any) => `<li style="margin:4px 0">${this.truncate(String(i?.productType ?? 'Item'))}</li>`)
            .join('')}</ul>`
        : '';

      const ctaUrl = `${this.appUrl()}/membros`;
      const html = emailLayout({
        preheader: 'Pagamento confirmado',
        title: 'Compra confirmada',
        subtitle: user.name ? `Olá, ${user.name}!` : 'Olá!',
        bodyHtml: `<p style="margin:0 0 12px 0">Pagamento confirmado. Seu acesso foi liberado.</p>${itemsHtml}
<p style="margin:14px 0 0 0;color:#6b7280">Pedido: ${this.truncate(orderId, 80)}</p>`,
        ctaText: 'Acessar agora',
        ctaUrl,
      });
      const text = textTemplate({
        title: 'Compra confirmada',
        lines: ['Pagamento confirmado. Seu acesso foi liberado.', `Pedido: ${orderId}`],
        ctaText: 'Acessar agora',
        ctaUrl,
      });

      await this.upsertEmailLog({ outboxEventId: row.id, tenantId: row.tenantId, userId: user.id, type: 'email.order_paid', title: 'Compra confirmada', body: `Pedido ${orderId}` });
      try {
        const sent = await this.email.send({ to: user.email, subject: 'Compra confirmada — Comunidade AI', html, text, idempotencyKey: row.id });
        await this.markEmailLog({ outboxEventId: row.id, status: 'SENT', providerMessageId: sent.id });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'erro';
        await this.markEmailLog({ outboxEventId: row.id, status: 'FAILED', error: message });
        throw e;
      }
      return;
    }

    if (topic === 'mentorship.unlocked') {
      const userId = payload.userId as string;
      const offerId = payload.offerId as string;
      if (!userId || !offerId) throw new Error('missing_payload');

      const [user, offer] = await Promise.all([
        this.prisma.user.findFirst({ where: { tenantId: row.tenantId, id: userId }, select: { id: true, email: true, name: true } }),
        this.prisma.mentorshipOffer.findFirst({ where: { tenantId: row.tenantId, id: offerId }, select: { id: true, name: true } }),
      ]);
      if (!user) return;

      const ctaUrl = `${this.appUrl()}/membros/mentoria`;
      const offerName = offer?.name ?? 'Mentoria';
      const html = emailLayout({
        preheader: 'Sua mentoria foi liberada',
        title: 'Mentoria liberada',
        subtitle: user.name ? `Olá, ${user.name}!` : 'Olá!',
        bodyHtml: `<p style="margin:0 0 12px 0">Sua mentoria foi liberada com sucesso.</p>
<p style="margin:0;color:#6b7280">Oferta: ${this.truncate(offerName, 120)}</p>`,
        ctaText: 'Acessar mentoria',
        ctaUrl,
      });
      const text = textTemplate({
        title: 'Mentoria liberada',
        lines: ['Sua mentoria foi liberada com sucesso.', `Oferta: ${offerName}`],
        ctaText: 'Acessar mentoria',
        ctaUrl,
      });

      await this.upsertEmailLog({ outboxEventId: row.id, tenantId: row.tenantId, userId: user.id, type: 'email.mentorship_unlocked', title: 'Mentoria liberada', body: offerName });
      try {
        const sent = await this.email.send({ to: user.email, subject: 'Mentoria liberada — Comunidade AI', html, text, idempotencyKey: row.id });
        await this.markEmailLog({ outboxEventId: row.id, status: 'SENT', providerMessageId: sent.id });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'erro';
        await this.markEmailLog({ outboxEventId: row.id, status: 'FAILED', error: message });
        throw e;
      }
      return;
    }

    if (topic === 'mentorship.session_scheduled') {
      const userId = payload.userId as string;
      const offerId = payload.offerId as string;
      const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
      const meetingUrl = typeof payload.meetingUrl === 'string' ? payload.meetingUrl : null;
      if (!userId || !offerId || !scheduledAt) throw new Error('missing_payload');

      const [user, offer] = await Promise.all([
        this.prisma.user.findFirst({ where: { tenantId: row.tenantId, id: userId }, select: { id: true, email: true, name: true } }),
        this.prisma.mentorshipOffer.findFirst({ where: { tenantId: row.tenantId, id: offerId }, select: { id: true, name: true } }),
      ]);
      if (!user) return;

      const when = scheduledAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      const ctaUrl = meetingUrl || `${this.appUrl()}/membros/mentoria`;
      const html = emailLayout({
        preheader: 'Mentoria agendada',
        title: 'Mentoria agendada',
        subtitle: user.name ? `Olá, ${user.name}!` : 'Olá!',
        bodyHtml: `<p style="margin:0 0 12px 0">Sua mentoria foi agendada.</p>
<p style="margin:0;color:#6b7280">Quando: ${this.truncate(when, 80)}</p>
${offer?.name ? `<p style="margin:8px 0 0 0;color:#6b7280">Oferta: ${this.truncate(offer.name, 120)}</p>` : ''}
${meetingUrl ? `<p style="margin:12px 0 0 0">Link da reunião: <a href="${this.truncate(meetingUrl, 1000)}">${this.truncate(meetingUrl, 80)}</a></p>` : ''}`,
        ctaText: meetingUrl ? 'Entrar na reunião' : 'Ver mentoria',
        ctaUrl,
      });
      const text = textTemplate({
        title: 'Mentoria agendada',
        lines: [`Quando: ${when}`, ...(offer?.name ? [`Oferta: ${offer.name}`] : []), ...(meetingUrl ? [`Link: ${meetingUrl}`] : [])],
        ctaText: meetingUrl ? 'Entrar na reunião' : 'Ver mentoria',
        ctaUrl,
      });

      await this.upsertEmailLog({ outboxEventId: row.id, tenantId: row.tenantId, userId: user.id, type: 'email.mentorship_scheduled', title: 'Mentoria agendada', body: when });
      try {
        const sent = await this.email.send({ to: user.email, subject: 'Mentoria agendada — Comunidade AI', html, text, idempotencyKey: row.id });
        await this.markEmailLog({ outboxEventId: row.id, status: 'SENT', providerMessageId: sent.id });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'erro';
        await this.markEmailLog({ outboxEventId: row.id, status: 'FAILED', error: message });
        throw e;
      }
      return;
    }

    if (topic === 'community.comment.created') {
      const recipientUserId = payload.recipientUserId as string;
      const postId = payload.postId as string;
      const commentId = payload.commentId as string;
      if (!recipientUserId || !postId || !commentId) return;

      const [recipient, post, comment] = await Promise.all([
        this.prisma.user.findFirst({ where: { tenantId: row.tenantId, id: recipientUserId }, select: { id: true, email: true, name: true } }),
        this.prisma.communityPost.findFirst({ where: { tenantId: row.tenantId, id: postId }, select: { id: true, title: true } }),
        this.prisma.communityComment.findFirst({ where: { tenantId: row.tenantId, id: commentId }, select: { id: true, body: true, author: { select: { name: true } } } }),
      ]);
      if (!recipient || !post || !comment) return;

      const ctaUrl = `${this.appUrl()}/membros/comunidade`;
      const snippet = this.truncate((comment.body ?? '').replace(/\s+/g, ' '), 180);
      const authorName = comment.author?.name ?? 'Alguém';
      const html = emailLayout({
        preheader: 'Nova resposta na comunidade',
        title: 'Nova resposta na comunidade',
        subtitle: recipient.name ? `Olá, ${recipient.name}!` : 'Olá!',
        bodyHtml: `<p style="margin:0 0 12px 0">${this.truncate(authorName, 80)} respondeu em <strong>${this.truncate(post.title, 120)}</strong>.</p>
<div style="margin:0;padding:12px 14px;border:1px solid #eef2f7;border-radius:14px;background:#fafafa;color:#111827">
  <p style="margin:0;font-size:14px;line-height:22px">${snippet}</p>
</div>`,
        ctaText: 'Ver na comunidade',
        ctaUrl,
      });
      const text = textTemplate({
        title: 'Nova resposta na comunidade',
        lines: [`${authorName} respondeu em "${post.title}".`, snippet],
        ctaText: 'Ver na comunidade',
        ctaUrl,
      });

      await this.upsertEmailLog({ outboxEventId: row.id, tenantId: row.tenantId, userId: recipient.id, type: 'email.community_reply', title: 'Nova resposta', body: post.title });
      try {
        const sent = await this.email.send({ to: recipient.email, subject: 'Nova resposta na comunidade — Comunidade AI', html, text, idempotencyKey: row.id });
        await this.markEmailLog({ outboxEventId: row.id, status: 'SENT', providerMessageId: sent.id });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'erro';
        await this.markEmailLog({ outboxEventId: row.id, status: 'FAILED', error: message });
        throw e;
      }
      return;
    }

    if (topic === 'admin.alert') {
      const kind = (payload.kind as string) || 'alert';
      const provider = (payload.provider as string) || '';
      const eventId = (payload.eventId as string) || '';
      const error = (payload.error as string) || '';

      const adminUsers = await this.prisma.userRole.findMany({
        where: { tenantId: row.tenantId, role: { key: 'ADMIN' } },
        select: { user: { select: { id: true, email: true, name: true } } },
        take: 50,
      });
      const recipients = adminUsers.map((r) => r.user).filter(Boolean);
      if (!recipients.length) return;

      const ctaUrl = `${this.appUrl()}/membros/admin/analytics`;
      const html = emailLayout({
        preheader: 'Alerta operacional',
        title: 'Alerta admin',
        subtitle: `Tipo: ${this.truncate(kind, 80)}`,
        bodyHtml: `<p style="margin:0 0 12px 0">Um evento precisa de atenção.</p>
<p style="margin:0;color:#6b7280">Provider: ${this.truncate(provider, 60)} • Evento: ${this.truncate(eventId, 120)}</p>
${error ? `<p style="margin:12px 0 0 0;color:#b91c1c">Erro: ${this.truncate(error, 500)}</p>` : ''}`,
        ctaText: 'Abrir painel',
        ctaUrl,
      });
      const text = textTemplate({
        title: 'Alerta admin',
        lines: [`Tipo: ${kind}`, ...(provider ? [`Provider: ${provider}`] : []), ...(eventId ? [`Evento: ${eventId}`] : []), ...(error ? [`Erro: ${error}`] : [])],
        ctaText: 'Abrir painel',
        ctaUrl,
      });

      for (const recipient of recipients) {
        await this.email.send({
          to: recipient.email,
          subject: `Alerta admin — ${kind} — Comunidade AI`,
          html,
          text,
          idempotencyKey: `${row.id}:${recipient.id}`,
        });
      }
      return;
    }
  }
}
