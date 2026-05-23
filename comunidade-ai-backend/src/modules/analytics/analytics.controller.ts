import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RequestWithTenant } from '../../tenant/tenant.middleware';
import { CurrentUser, Public } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { AnalyticsService } from './analytics.service';
import { TrackEventDto } from './dto/track-event.dto';
import { TrackPageViewDto } from './dto/track-pageview.dto';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Public()
  @Post('event')
  async event(@Req() req: Request & RequestWithTenant, @Body() body: TrackEventDto) {
    if (!req.tenantId) throw new Error('Tenant não resolvido');
    return this.analytics.trackEvent({
      tenantId: req.tenantId,
      name: body.name,
      properties: body.properties,
      sessionId: body.sessionId,
      referrer: body.referrer,
      userAgent: req.header('user-agent') ?? undefined,
      ip: req.ip,
    });
  }

  @Post('me/event')
  async meEvent(@CurrentUser() user: AuthUser, @Req() req: Request, @Body() body: TrackEventDto) {
    return this.analytics.trackEvent({
      tenantId: user.tenantId,
      userId: user.userId,
      name: body.name,
      properties: body.properties,
      sessionId: body.sessionId,
      referrer: body.referrer,
      userAgent: req.header('user-agent') ?? undefined,
      ip: req.ip,
    });
  }

  @Public()
  @Post('pageview')
  async pageview(@Req() req: Request & RequestWithTenant, @Body() body: TrackPageViewDto) {
    if (!req.tenantId) throw new Error('Tenant não resolvido');
    return this.analytics.trackPageView({
      tenantId: req.tenantId,
      path: body.path,
      title: body.title,
      sessionId: body.sessionId,
      referrer: body.referrer,
      userAgent: req.header('user-agent') ?? undefined,
      ip: req.ip,
    });
  }

  @Post('me/pageview')
  async mePageview(@CurrentUser() user: AuthUser, @Req() req: Request, @Body() body: TrackPageViewDto) {
    return this.analytics.trackPageView({
      tenantId: user.tenantId,
      userId: user.userId,
      path: body.path,
      title: body.title,
      sessionId: body.sessionId,
      referrer: body.referrer,
      userAgent: req.header('user-agent') ?? undefined,
      ip: req.ip,
    });
  }
}
