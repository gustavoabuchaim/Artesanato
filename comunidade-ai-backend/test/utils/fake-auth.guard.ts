import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthUser } from '../../src/modules/auth/auth.types';

@Injectable()
export class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<any>();
    const raw = req.header?.('x-test-user') ?? req.headers?.['x-test-user'];
    if (!raw || typeof raw !== 'string') throw new UnauthorizedException();
    const [tenantId, userId] = raw.split(':');
    if (!tenantId || !userId) throw new UnauthorizedException();
    const user: AuthUser = { tenantId, userId };
    req.user = user;
    req.tenantId = tenantId;
    return true;
  }
}

