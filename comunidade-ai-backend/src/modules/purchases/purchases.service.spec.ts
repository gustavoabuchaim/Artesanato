import { PurchasesService } from './purchases.service';

describe('PurchasesService', () => {
  it('should track purchase.checkout_created', async () => {
    const prisma: any = {
      price: {
        findFirst: jest.fn(async () => ({
          id: 'price1',
          amountCents: 1000,
          currency: 'BRL',
          product: { id: 'prod1', name: 'Produto', type: 'MEMBERSHIP', metadata: { hotmartCheckoutUrl: 'https://hotmart/checkout' } },
        })),
      },
      order: {
        count: jest.fn(async () => 0),
        create: jest.fn(async () => ({ id: 'order1' })),
        update: jest.fn(async () => ({ id: 'order1' })),
      },
      auditLog: { create: jest.fn(async () => ({ id: 'log1' })) },
      analyticsEvent: { create: jest.fn(async () => ({ id: 'a1' })) },
    };

    const config: any = { get: jest.fn(() => '') };
    const bruteForce: any = { assertAllowed: jest.fn(async () => undefined), reset: jest.fn(async () => undefined), recordFailure: jest.fn(async () => undefined) };
    const logger: any = { error: jest.fn() };

    const service = new PurchasesService(prisma, config, bruteForce, logger);

    const res = await service.createCheckout({
      tenantId: 't1',
      userId: 'u1',
      priceId: 'price1',
      provider: 'HOTMART',
      successUrl: 'http://localhost/success',
      cancelUrl: 'http://localhost/cancel',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(res.orderId).toBe('order1');
    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'purchase.checkout_created' }),
      }),
    );
  });
});
