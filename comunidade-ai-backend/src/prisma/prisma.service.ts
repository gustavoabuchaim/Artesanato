import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = (process.env.DATABASE_URL ?? '').trim();
    if (!connectionString) {
      throw new Error('DATABASE_URL não configurado');
    }
    const adapter = new PrismaPg(connectionString);
    super({ adapter });
  }

  async onModuleInit() {
    const timeoutMsRaw = process.env.PRISMA_CONNECT_TIMEOUT_MS;
    const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) : 5000;
    const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;

    try {
      await Promise.race([
        this.$connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Prisma connect timeout')), timeout)),
      ]);
    } catch (e) {
      const appEnv = (process.env.APP_ENV ?? 'local').toLowerCase();
      const allowDbDownLocal = (process.env.ALLOW_DB_DOWN_LOCAL ?? '').trim() === '1';
      if (appEnv === 'local' && allowDbDownLocal) return;
      throw e;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
