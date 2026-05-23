import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AccessTokenGuard } from './access-token.guard';

jest.mock('../jwt', () => ({
  verifyAccessToken: jest.fn(async () => ({ tenantId: '11111111-1111-1111-1111-111111111111', userId: '22222222-2222-2222-2222-222222222222' })),
}));

function createContext(params: { cookies?: Record<string, string>; tenantId?: string }) {
  const req: any = {
    cookies: params.cookies ?? {},
    tenantId: params.tenantId,
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

describe('AccessTokenGuard', () => {
  it('should block when missing cookie', async () => {
    const reflector = { getAllAndOverride: jest.fn(() => false) } as unknown as Reflector;
    const config = { get: jest.fn(() => 'secret-1234567890abcdef') } as unknown as ConfigService;
    const guard = new AccessTokenGuard(reflector, config);

    await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should set req.user when token is valid', async () => {
    const reflector = { getAllAndOverride: jest.fn(() => false) } as unknown as Reflector;
    const config = { get: jest.fn(() => 'secret-1234567890abcdef') } as unknown as ConfigService;
    const guard = new AccessTokenGuard(reflector, config);

    const ctx = createContext({ cookies: { access_token: 'token' } });
    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
    const req = ctx.switchToHttp().getRequest();
    expect(req.user?.userId).toBe('22222222-2222-2222-2222-222222222222');
    expect(req.user?.tenantId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('should block on tenant mismatch', async () => {
    const reflector = { getAllAndOverride: jest.fn(() => false) } as unknown as Reflector;
    const config = { get: jest.fn(() => 'secret-1234567890abcdef') } as unknown as ConfigService;
    const guard = new AccessTokenGuard(reflector, config);

    await expect(
      guard.canActivate(createContext({ cookies: { access_token: 'token' }, tenantId: '99999999-9999-9999-9999-999999999999' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
