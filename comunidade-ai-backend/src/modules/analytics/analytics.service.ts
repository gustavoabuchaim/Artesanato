import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async trackEvent(params: {
    tenantId: string;
    userId?: string;
    sessionId?: string;
    name: string;
    properties?: unknown;
    referrer?: string;
    userAgent?: string;
    ip?: string;
  }) {
    await this.prisma.analyticsEvent.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        sessionId: params.sessionId ?? null,
        name: params.name,
        properties: params.properties as never,
        referrer: params.referrer,
        userAgent: params.userAgent,
        ip: params.ip,
      },
      select: { id: true },
    });
    return { ok: true };
  }

  async trackPageView(params: {
    tenantId: string;
    userId?: string;
    sessionId?: string;
    path: string;
    title?: string;
    referrer?: string;
    userAgent?: string;
    ip?: string;
  }) {
    await this.prisma.pageView.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        sessionId: params.sessionId ?? null,
        path: params.path,
        title: params.title,
        referrer: params.referrer,
        userAgent: params.userAgent,
        ip: params.ip,
      },
      select: { id: true },
    });
    return { ok: true };
  }
}
