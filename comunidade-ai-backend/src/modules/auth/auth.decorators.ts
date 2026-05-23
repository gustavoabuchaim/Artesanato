import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Request } from 'express';
import { ACCESS_TOKEN_COOKIE, IS_PUBLIC_KEY, ROLES_KEY } from './auth.constants';
import { AuthUser } from './auth.types';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
  if (!req.user) {
    throw new Error('Usuário não encontrado no request');
  }
  return req.user;
});

export const CurrentAccessToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
    return typeof token === 'string' ? token : null;
  },
);

