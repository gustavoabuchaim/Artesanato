import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '../modules/auth/auth.constants';
import { CSRF_COOKIE, CSRF_HEADER, SKIP_CSRF_KEY } from './csrf.constants';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly logger: PinoLogger,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const method = (req.method || 'GET').toUpperCase();

    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const hasAuthCookie =
      typeof req.cookies?.[ACCESS_TOKEN_COOKIE] === 'string' || typeof req.cookies?.[REFRESH_TOKEN_COOKIE] === 'string';
    if (!hasAuthCookie) return true;

    const cookieToken = req.cookies?.[CSRF_COOKIE];
    const headerToken = req.header(CSRF_HEADER);

    if (typeof cookieToken !== 'string' || !cookieToken) {
      this.logger.warn({ event: 'security.csrf_blocked', reason: 'missing_cookie', method, path: req.path }, 'CSRF blocked');
      throw new ForbiddenException('CSRF');
    }
    if (typeof headerToken !== 'string' || !headerToken) {
      this.logger.warn({ event: 'security.csrf_blocked', reason: 'missing_header', method, path: req.path }, 'CSRF blocked');
      throw new ForbiddenException('CSRF');
    }
    if (cookieToken !== headerToken) {
      this.logger.warn({ event: 'security.csrf_blocked', reason: 'mismatch', method, path: req.path }, 'CSRF blocked');
      throw new ForbiddenException('CSRF');
    }

    return true;
  }
}
