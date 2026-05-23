import { Body, Controller, Headers, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';
import { Request } from 'express';
import { Public, Roles } from '../auth/auth.decorators';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Public()
  @Throttle({ default: { limit: 600, ttl: minutes(1) } })
  @Post('stripe')
  async stripe(@Req() req: Request & { rawBody?: Buffer }, @Headers('stripe-signature') signature?: string) {
    const rawBody = req.rawBody;
    if (!rawBody) throw new Error('rawBody ausente');
    return this.webhooks.handleStripeWebhook({ rawBody, signature });
  }

  @Public()
  @Throttle({ default: { limit: 600, ttl: minutes(1) } })
  @Post('mercadopago')
  async mercadopago(@Req() req: Request & { rawBody?: Buffer }, @Body() body: unknown, @Headers() headers: Record<string, string>) {
    return this.webhooks.handleMercadoPagoWebhook({ rawBody: req.rawBody, body, headers, query: req.query });
  }

  @Public()
  @Throttle({ default: { limit: 600, ttl: minutes(1) } })
  @Post('hotmart')
  async hotmart(@Req() req: Request & { rawBody?: Buffer }, @Body() body: unknown, @Headers() headers: Record<string, string>) {
    return this.webhooks.handleHotmartWebhook({ rawBody: req.rawBody, body, headers });
  }

  @Public()
  @Throttle({ default: { limit: 600, ttl: minutes(1) } })
  @Post('pandavideo')
  async pandavideo(@Req() req: Request & { rawBody?: Buffer }, @Body() body: unknown, @Headers() headers: Record<string, string>) {
    return this.webhooks.handlePandaVideoWebhook({ rawBody: req.rawBody, body, headers });
  }

  @Roles('ADMIN')
  @Throttle({ default: { limit: 60, ttl: minutes(1) } })
  @Post('retry/:provider/:eventId')
  async retry(@Param('provider') provider: string, @Param('eventId') eventId: string) {
    return this.webhooks.retryWebhook({ provider, eventId });
  }
}
