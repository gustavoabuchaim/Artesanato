import { EbooksService } from './ebooks.service';

describe('EbooksService', () => {
  it('should track ebook.download on download url', async () => {
    const prisma: any = {
      ebook: { findFirst: jest.fn(async () => ({ id: 'e1', file: { r2Key: 'r2/key' } })) },
      libraryItem: { findUnique: jest.fn(async () => ({ revokedAt: null })) },
      ebookDownload: { create: jest.fn(async () => ({ id: 'd1' })) },
      analyticsEvent: { create: jest.fn(async () => ({ id: 'a1' })) },
    };

    const uploads: any = { getSignedReadUrl: jest.fn(async () => 'https://signed') };
    const service = new EbooksService(prisma, uploads);

    const res = await service.getDownloadUrl({
      tenantId: 't1',
      userId: 'u1',
      ebookId: 'e1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(res.url).toBe('https://signed');
    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'ebook.download' }),
      }),
    );
  });
});

