import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantService } from './tenant.service';

export type RequestWithTenant = Request & {
  tenantId?: string;
  tenantSlug?: string;
};

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantService: TenantService) {}

  async use(req: RequestWithTenant, _res: Response, next: NextFunction) {
    const url = (req.originalUrl ?? req.url ?? '').toString();
    if (url.startsWith('/api/health') || url.startsWith('/api/docs')) return next();

    const headerSlug = req.header('x-tenant-slug')?.trim();
    let slug: string | undefined;
    try {
      slug = headerSlug || (await this.tenantService.getDefaultTenant())?.slug;
    } catch (e) {
      return next(e as Error);
    }

    if (!slug) {
      req.tenantSlug = undefined;
      req.tenantId = undefined;
      return next();
    }

    try {
      const tenant = await this.tenantService.getBySlug(slug);
      req.tenantSlug = slug;
      req.tenantId = tenant?.id;
      return next();
    } catch (e) {
      return next(e as Error);
    }
  }
}
