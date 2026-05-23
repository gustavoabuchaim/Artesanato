import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { IS_PUBLIC_KEY, ACCESS_TOKEN_COOKIE } from '../auth.constants';
import { verifyAccessToken } from '../jwt';
import { AuthUser } from '../auth.types';
import { RequestWithTenant } from '../../../tenant/tenant.middleware';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & RequestWithTenant & { user?: AuthUser }>();
    const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
    if (typeof token !== 'string' || !token) {
      throw new UnauthorizedException();
    }

    const secret = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) throw new Error('JWT_ACCESS_SECRET não configurado');

    const payload = await verifyAccessToken({ secret, token });

    if (req.tenantId && req.tenantId !== payload.tenantId) {
      throw new UnauthorizedException();
    }

    req.user = payload;
    req.tenantId = payload.tenantId;
    return true;
  }
}

