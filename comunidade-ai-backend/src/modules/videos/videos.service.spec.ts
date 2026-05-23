import { VideosService } from './videos.service';

describe('VideosService', () => {
  it('should track video.watch_time', async () => {
    const prisma: any = {
      lesson: { findFirst: jest.fn(async () => ({ id: 'l1', module: { courseId: 'c1' }, video: { pandaVideoId: 'pv1' } })) },
      entitlement: { findFirst: jest.fn(async () => ({ id: 'e1' })) },
      analyticsEvent: { create: jest.fn(async () => ({ id: 'a1' })) },
    };
    const config: any = { get: jest.fn(() => '') };
    const logger: any = { error: jest.fn() };
    const service = new VideosService(prisma, config, logger);

    await service.trackWatchTime({
      tenantId: 't1',
      userId: 'u1',
      lessonId: 'l1',
      secondsWatched: 30,
      positionSec: 10,
      ip: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'video.watch_time' }) }),
    );
  });

  it('should track video.lesson_completed when progress is completed', async () => {
    const prisma: any = {
      lesson: { findFirst: jest.fn(async () => ({ id: 'l1', module: { courseId: 'c1' } })) },
      entitlement: { findFirst: jest.fn(async () => ({ id: 'e1' })) },
      lessonProgress: { upsert: jest.fn(async () => ({ lessonId: 'l1', completedAt: new Date() })) },
      analyticsEvent: { create: jest.fn(async () => ({ id: 'a1' })) },
    };
    const config: any = { get: jest.fn(() => '') };
    const logger: any = { error: jest.fn() };
    const service = new VideosService(prisma, config, logger);

    await service.trackProgress({
      tenantId: 't1',
      userId: 'u1',
      lessonId: 'l1',
      completed: true,
      progressPercent: 100,
      positionSec: 120,
    });

    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'video.lesson_completed' }) }),
    );
  });
});

