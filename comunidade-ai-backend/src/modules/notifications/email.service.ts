import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  idempotencyKey?: string;
};

@Injectable()
export class EmailService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  async send(params: SendEmailParams) {
    const provider = (this.config.get<string>('EMAIL_PROVIDER') ?? 'console').toLowerCase();
    if (provider === 'console') {
      this.logger.info({ event: 'email.console', to: params.to, subject: params.subject }, 'Email (console)');
      return { provider: 'console', id: 'console' };
    }

    const apiKey = (this.config.get<string>('RESEND_API_KEY') ?? '').trim();
    const from = (this.config.get<string>('EMAIL_FROM') ?? '').trim();
    const replyTo = (params.replyTo ?? this.config.get<string>('SUPPORT_EMAIL') ?? '').trim() || undefined;

    if (!apiKey) throw new Error('RESEND_API_KEY não configurado');
    if (!from) throw new Error('EMAIL_FROM não configurado');

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        ...(params.idempotencyKey ? { 'idempotency-key': params.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    const bodyText = await resp.text();
    if (!resp.ok) {
      this.logger.error(
        { event: 'email.resend_error', status: resp.status, response: bodyText.slice(0, 4000) },
        'Resend request failed',
      );
      throw new Error(`Resend error (${resp.status})`);
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      parsed = null;
    }

    const id = typeof parsed?.id === 'string' ? parsed.id : 'unknown';
    return { provider: 'resend', id };
  }
}
