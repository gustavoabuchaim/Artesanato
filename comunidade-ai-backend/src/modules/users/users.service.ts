import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(tenantId: string, email: string) {
    return this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: email.toLowerCase() } },
      include: { credential: true },
    });
  }

  async findById(tenantId: string, userId: string) {
    return this.prisma.user.findFirst({
      where: { tenantId, id: userId },
      select: { id: true, tenantId: true, email: true, name: true, status: true, createdAt: true },
    });
  }

  async updateMe(params: { tenantId: string; userId: string; name?: string }) {
    return this.prisma.user.update({
      where: { id: params.userId },
      data: { name: params.name ?? undefined },
      select: { id: true, tenantId: true, email: true, name: true, status: true, createdAt: true },
    });
  }

  async addToWaitlist(params: { tenantId: string; email: string; name?: string }) {
    const email = params.email.toLowerCase();
    const existing = await this.prisma.waitlistSubscriber.findUnique({
      where: { tenantId_email: { tenantId: params.tenantId, email } },
      select: { id: true },
    });

    if (!existing) {
      await this.prisma.waitlistSubscriber.create({
        data: { tenantId: params.tenantId, email, name: params.name ?? null },
        select: { id: true },
      });
      await this.prisma.outboxEvent.create({
        data: { tenantId: params.tenantId, topic: 'waitlist.subscribed', payload: { email, name: params.name ?? null } },
        select: { id: true },
      });
      return { ok: true };
    }

    await this.prisma.waitlistSubscriber.update({
      where: { id: existing.id },
      data: { name: params.name ?? undefined },
      select: { id: true },
    });
    return { ok: true };
  }

  async createUser(params: { tenantId: string; email: string; name?: string; phone?: string; passwordHash: string }) {
    return this.prisma.user.create({
      data: {
        tenantId: params.tenantId,
        email: params.email.toLowerCase(),
        name: params.name ?? null,
        phone: params.phone ?? null,
        credential: { create: { passwordHash: params.passwordHash } },
        onboarding: { create: { tenantId: params.tenantId } },
      },
      select: { id: true, tenantId: true, email: true, name: true },
    });
  }
}
