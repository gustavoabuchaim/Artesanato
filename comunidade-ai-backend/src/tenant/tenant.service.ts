import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantService {
  private cache = new Map<string, { id: string; slug: string; name: string }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private toServiceUnavailable(e: unknown): ServiceUnavailableException | null {
    if (e instanceof Prisma.PrismaClientInitializationError) {
      return new ServiceUnavailableException('Banco de dados indisponível. Verifique o Postgres e a variável DATABASE_URL.');
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      const message = e.message ?? '';
      if (e.code === 'P2021' || /ECONNREFUSED/i.test(message) || /can(?:not|')t reach database server/i.test(message) || /connect/i.test(message)) {
        return new ServiceUnavailableException('Banco de dados indisponível. Inicie o Postgres e rode as migrações.');
      }
    }
    if (e instanceof Error) {
      const message = e.message ?? '';
      if (/ECONNREFUSED/i.test(message) || /can(?:not|')t reach database server/i.test(message) || /connect timeout/i.test(message)) {
        return new ServiceUnavailableException('Banco de dados indisponível. Inicie o Postgres e rode as migrações.');
      }
    }
    return null;
  }

  async getBySlug(slug: string) {
    const cached = this.cache.get(slug);
    if (cached) return cached;

    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug },
        select: { id: true, slug: true, name: true },
      });

      if (!tenant) return null;
      this.cache.set(slug, tenant);
      return tenant;
    } catch (e) {
      const mapped = this.toServiceUnavailable(e);
      if (mapped) throw mapped;
      throw e;
    }
  }

  async getDefaultTenant() {
    const slug = this.config.get<string>('DEFAULT_TENANT_SLUG') ?? 'default';
    return this.getBySlug(slug);
  }

  async ensureDefaultTenant() {
    const slug = this.config.get<string>('DEFAULT_TENANT_SLUG') ?? 'default';
    try {
      const existing = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
      if (existing) return existing.id;

      const created = await this.prisma.tenant.create({
        data: { slug, name: 'Default', plan: 'FREE', isActive: true },
        select: { id: true },
      });
      return created.id;
    } catch (e) {
      const mapped = this.toServiceUnavailable(e);
      if (mapped) throw mapped;
      throw e;
    }
  }
}
