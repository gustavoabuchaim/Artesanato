import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';
import { Request } from 'express';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PurchasesService } from './purchases.service';

@ApiTags('purchases')
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Throttle({ default: { limit: 30, ttl: minutes(1) } })
  @Post('checkout')
  async checkout(@CurrentUser() user: AuthUser, @Body() body: CreateCheckoutDto, @Req() req: Request) {
    const origin = req.header('origin') || 'http://localhost:3000';
    const successUrl = `${origin}/membros?checkout=success`;
    const cancelUrl = `${origin}/membros?checkout=cancel`;

    return this.purchases.createCheckout({
      tenantId: user.tenantId,
      userId: user.userId,
      priceId: body.priceId,
      provider: body.provider,
      successUrl,
      cancelUrl,
      idempotencyKey: req.header('idempotency-key') ?? undefined,
      ip: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
    });
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return this.purchases.listMyOrders(user.tenantId, user.userId);
  }

  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @Post('orders/:orderId/cancel')
  async cancel(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string) {
    return this.purchases.cancelOrder({ tenantId: user.tenantId, userId: user.userId, orderId });
  }

  @Roles('ADMIN')
  @Throttle({ default: { limit: 30, ttl: minutes(1) } })
  @Post('orders/:orderId/refund')
  async refund(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string, @Req() req: Request) {
    return this.purchases.refundOrder({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      orderId,
      ip: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
    });
  }

  @Roles('ADMIN')
  @Throttle({ default: { limit: 60, ttl: minutes(1) } })
  @Post('orders/:orderId/sync')
  async sync(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string) {
    return this.purchases.syncOrderPayment({ tenantId: user.tenantId, orderId });
  }
}
