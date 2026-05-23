import { BadRequestException, Injectable } from '@nestjs/common';
import crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GuestArtisansService {
  constructor(private readonly prisma: PrismaService) {}

  async invite(params: { tenantId: string; actorUserId: string; email: string; name?: string }) {
    const email = params.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: params.tenantId, email } },
      select: { id: true, status: true },
    });
    if (existing) throw new BadRequestException('Usuário já existe');

    const role = await this.prisma.role.upsert({
      where: { tenantId_key: { tenantId: params.tenantId, key: 'GUEST_ARTISAN' } },
      update: { name: 'Artesã convidada' },
      create: { tenantId: params.tenantId, key: 'GUEST_ARTISAN', name: 'Artesã convidada', scope: 'TENANT' },
      select: { id: true },
    });

    const user = await this.prisma.user.create({
      data: {
        tenantId: params.tenantId,
        email,
        name: params.name ?? null,
        status: 'INVITED',
        roles: { create: [{ tenantId: params.tenantId, roleId: role.id }] },
      },
      select: { id: true, email: true, name: true },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { tenantId: params.tenantId, userId: user.id, tokenHash, expiresAt },
      select: { id: true },
    });

    await this.prisma.outboxEvent.create({
      data: { tenantId: params.tenantId, topic: 'guest_artisan.invited', payload: { userId: user.id, email, token } },
      select: { id: true },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        targetUserId: user.id,
        action: 'guest_artisan.invited',
        targetType: 'User',
        targetId: user.id,
      },
      select: { id: true },
    });

    return { ...user, inviteToken: token };
  }

  async list(tenantId: string) {
    return this.prisma.user.findMany({
      where: {
        tenantId,
        roles: { some: { role: { key: 'GUEST_ARTISAN' } } },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, name: true, status: true, createdAt: true },
      take: 100,
    });
  }
}
