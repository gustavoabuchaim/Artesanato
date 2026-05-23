import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';

@Injectable()
export class EbooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  async listPublished(tenantId: string) {
    return this.prisma.ebook.findMany({
      where: { tenantId, status: 'PUBLISHED' },
      select: { id: true, title: true, description: true, publishedAt: true, coverFileId: true },
      orderBy: { publishedAt: 'desc' },
    });
  }

  async listMyLibrary(tenantId: string, userId: string) {
    return this.prisma.libraryItem.findMany({
      where: { tenantId, userId, revokedAt: null },
      select: {
        grantedAt: true,
        ebook: { select: { id: true, title: true, description: true, coverFileId: true, publishedAt: true } },
      },
      orderBy: { grantedAt: 'desc' },
    });
  }

  async getDownloadUrl(params: { tenantId: string; userId: string; ebookId: string; ip?: string; userAgent?: string }) {
    const ebook = await this.prisma.ebook.findFirst({
      where: { tenantId: params.tenantId, id: params.ebookId, status: 'PUBLISHED' },
      select: { id: true, file: { select: { r2Key: true } } },
    });
    if (!ebook) throw new NotFoundException();
    if (!ebook.file) throw new NotFoundException();

    const access = await this.prisma.libraryItem.findUnique({
      where: { userId_ebookId: { userId: params.userId, ebookId: ebook.id } },
      select: { revokedAt: true },
    });
    if (!access || access.revokedAt) throw new ForbiddenException();

    await this.prisma.ebookDownload.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        ebookId: params.ebookId,
        ip: params.ip,
        userAgent: params.userAgent,
      },
      select: { id: true },
    });

    await this.prisma.analyticsEvent.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        name: 'ebook.download',
        properties: { ebookId: params.ebookId } as never,
        userAgent: params.userAgent ?? null,
        ip: params.ip ?? null,
      },
      select: { id: true },
    });

    const url = await this.uploads.getSignedReadUrl({ tenantId: params.tenantId, r2Key: ebook.file.r2Key });
    return { url };
  }
}
