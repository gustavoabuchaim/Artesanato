import { OnboardingService } from './onboarding.service';

describe('OnboardingService', () => {
  it('should track onboarding.step on updateState', async () => {
    const prisma: any = {
      onboardingState: { upsert: jest.fn(async () => ({ userId: 'u1', step: 2 })) },
      analyticsEvent: { create: jest.fn(async () => ({ id: 'a1' })) },
    };

    const service = new OnboardingService(prisma);
    const state = await service.updateState({ tenantId: 't1', userId: 'u1', step: 2, data: { x: 1 } });

    expect(state.step).toBe(2);
    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'onboarding.step' }) }),
    );
  });

  it('should track onboarding.completed on complete', async () => {
    const prisma: any = {
      onboardingState: { update: jest.fn(async () => ({ userId: 'u1', step: 3, completedAt: new Date().toISOString() })) },
      analyticsEvent: { create: jest.fn(async () => ({ id: 'a1' })) },
    };

    const service = new OnboardingService(prisma);
    await service.complete('t1', 'u1');

    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'onboarding.completed' }) }),
    );
  });
});

