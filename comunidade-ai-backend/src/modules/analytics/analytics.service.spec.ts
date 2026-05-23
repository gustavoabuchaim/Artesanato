import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  it('should write AnalyticsEvent', async () => {
    const prisma: any = { analyticsEvent: { create: jest.fn(async () => ({ id: 'a1' })) } };
    const service = new AnalyticsService(prisma);

    const res = await service.trackEvent({ tenantId: 't1', userId: 'u1', name: 'test.event', properties: { a: 1 }, ip: '127.0.0.1' });
    expect(res.ok).toBe(true);
    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: 'test.event' }) }));
  });

  it('should write PageView', async () => {
    const prisma: any = { pageView: { create: jest.fn(async () => ({ id: 'p1' })) } };
    const service = new AnalyticsService(prisma);

    const res = await service.trackPageView({ tenantId: 't1', userId: 'u1', path: '/membros', title: 'Membros', referrer: '' });
    expect(res.ok).toBe(true);
    expect(prisma.pageView.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ path: '/membros' }) }));
  });
});

