import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(tenantId: string, userId: string) {
    return this.prisma.onboardingState.findUnique({
      where: { userId },
      select: { userId: true, step: true, completedAt: true, data: true, updatedAt: true },
    });
  }

  async updateState(params: { tenantId: string; userId: string; step: number; data?: unknown }) {
    const state = await this.prisma.onboardingState.upsert({
      where: { userId: params.userId },
      update: { step: params.step, data: params.data as never },
      create: { tenantId: params.tenantId, userId: params.userId, step: params.step, data: params.data as never },
      select: { userId: true, step: true, completedAt: true, data: true, updatedAt: true },
    });

    await this.prisma.analyticsEvent.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        name: 'onboarding.step',
        properties: { step: params.step } as never,
      },
      select: { id: true },
    });

    return state;
  }

  async complete(tenantId: string, userId: string) {
    const state = await this.prisma.onboardingState.update({
      where: { userId },
      data: { completedAt: new Date() },
      select: { userId: true, step: true, completedAt: true, data: true, updatedAt: true },
    });

    await this.prisma.analyticsEvent.create({
      data: { tenantId, userId, name: 'onboarding.completed' },
      select: { id: true },
    });

    return state;
  }
}
