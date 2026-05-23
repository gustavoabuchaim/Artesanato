import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { RolesGuard } from './roles.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import { ROLES_KEY } from '../auth.constants';

function createContext(params: { tenantId: string; userId: string; ip?: string; requiredRoles: string[] }) {
  const req: any = { user: { tenantId: params.tenantId, userId: params.userId }, ip: params.ip, path: '/admin' };
  const handler = () => ({});
  const cls = class {};
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => cls,
    __handler: handler,
    __class: cls,
    __roles: params.requiredRoles,
  } as any;
}

describe('RolesGuard', () => {
  it('should allow when user has required role', async () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: any) => (key === ROLES_KEY ? ['ADMIN'] : undefined)),
    } as unknown as Reflector;

    const prisma = {
      userRole: { findMany: jest.fn(async () => [{ role: { key: 'ADMIN' } }]) },
    } as unknown as PrismaService;

    const config = { get: jest.fn(() => '') } as unknown as ConfigService;
    const cache = { get: jest.fn(async () => undefined), set: jest.fn(async () => undefined) } as any;
    const logger = { warn: jest.fn() } as unknown as PinoLogger;

    const guard = new RolesGuard(reflector, prisma, config, cache, logger);
    const ctx = createContext({ tenantId: 't1', userId: 'u1', requiredRoles: ['ADMIN'] });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('should block when user lacks role', async () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: any) => (key === ROLES_KEY ? ['ADMIN'] : undefined)),
    } as unknown as Reflector;

    const prisma = {
      userRole: { findMany: jest.fn(async () => [{ role: { key: 'MEMBER' } }]) },
    } as unknown as PrismaService;

    const config = { get: jest.fn(() => '') } as unknown as ConfigService;
    const cache = { get: jest.fn(async () => undefined), set: jest.fn(async () => undefined) } as any;
    const logger = { warn: jest.fn() } as unknown as PinoLogger;

    const guard = new RolesGuard(reflector, prisma, config, cache, logger);
    const ctx = createContext({ tenantId: 't1', userId: 'u1', requiredRoles: ['ADMIN'] });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should block ADMIN when ip allowlist is configured and ip mismatches', async () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: any) => (key === ROLES_KEY ? ['ADMIN'] : undefined)),
    } as unknown as Reflector;

    const prisma = {
      userRole: { findMany: jest.fn(async () => [{ role: { key: 'ADMIN' } }]) },
    } as unknown as PrismaService;

    const config = { get: jest.fn(() => '10.0.0.1') } as unknown as ConfigService;
    const cache = { get: jest.fn(async () => undefined), set: jest.fn(async () => undefined) } as any;
    const logger = { warn: jest.fn() } as unknown as PinoLogger;

    const guard = new RolesGuard(reflector, prisma, config, cache, logger);
    const ctx = createContext({ tenantId: 't1', userId: 'u1', requiredRoles: ['ADMIN'], ip: '10.0.0.2' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
