import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, userId: string) {
    return this.prisma.notification.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, type: true, title: true, body: true, payload: true, status: true, createdAt: true, readAt: true },
    });
  }

  async markRead(tenantId: string, userId: string, notificationId: string) {
    const n = await this.prisma.notification.findFirst({
      where: { tenantId, userId, id: notificationId },
      select: { id: true },
    });
    if (!n) throw new NotFoundException();

    await this.prisma.notification.update({
      where: { id: n.id },
      data: { readAt: new Date(), status: 'READ' },
      select: { id: true },
    });
    return { ok: true };
  }
}
