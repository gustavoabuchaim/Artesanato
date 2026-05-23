import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Cache } from 'cache-manager';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../prisma/prisma.service';
import { ROLES_KEY } from '../auth.constants';
import { AuthUser } from '../auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly logger: PinoLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthUser; ip?: string; path?: string }>();
    if (!req.user) {
      this.logger.warn({ event: 'security.rbac_blocked', reason: 'missing_user', path: req.path }, 'RBAC blocked');
      throw new ForbiddenException();
    }

    const cacheKey = `roles:${req.user.tenantId}:${req.user.userId}`;
    const cached = await this.cache.get<string[]>(cacheKey);
    const roles = cached ?? (await this.getUserRoleKeys(req.user.tenantId, req.user.userId));
    if (!cached) await this.cache.set(cacheKey, roles, 30_000);

    const ok = required.some((r) => roles.includes(r));
    if (!ok) {
      this.logger.warn(
        { event: 'security.rbac_blocked', tenantId: req.user.tenantId, userId: req.user.userId, required },
        'RBAC blocked',
      );
      throw new ForbiddenException();
    }

    const requiresAdmin = required.includes('ADMIN');
    if (requiresAdmin) {
      const allowlistRaw = this.config.get<string>('ADMIN_IP_ALLOWLIST') ?? '';
      const allowlist = allowlistRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (allowlist.length > 0) {
        const ip = this.normalizeIp(req.ip);
        const allowed = allowlist.includes(ip);
        if (!allowed) {
          this.logger.warn(
            { event: 'security.admin_ip_blocked', tenantId: req.user.tenantId, userId: req.user.userId, ip },
            'Admin IP blocked',
          );
          throw new ForbiddenException();
        }
      }
    }

    return true;
  }

  private async getUserRoleKeys(tenantId: string, userId: string) {
    const rows = await this.prisma.userRole.findMany({
      where: { tenantId, userId },
      select: { role: { select: { key: true } } },
    });
    return rows.map((r) => r.role.key);
  }

  private normalizeIp(ip: unknown) {
    if (typeof ip !== 'string') return '';
    const trimmed = ip.trim();
    const first = trimmed.includes(',') ? trimmed.split(',')[0].trim() : trimmed;
    return first.startsWith('::ffff:') ? first.slice('::ffff:'.length) : first;
  }
}
