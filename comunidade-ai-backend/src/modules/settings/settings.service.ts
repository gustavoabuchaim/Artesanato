import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    return this.prisma.tenantSetting.findMany({
      where: { tenantId },
      select: { key: true, value: true, updatedAt: true },
      orderBy: { key: 'asc' },
    });
  }

  async set(tenantId: string, key: string, value: unknown) {
    return this.prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key } },
      update: { value: value as never },
      create: { tenantId, key, value: value as never },
      select: { key: true, value: true, updatedAt: true },
    });
  }
}
