import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { PinoLogger } from 'nestjs-pino';
import { AdminController } from '../src/modules/admin/admin.controller';
import { AdminService } from '../src/modules/admin/admin.service';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakeAuthGuard } from './utils/fake-auth.guard';
import { createMemoryCache } from './utils/memory-cache';
import { ids } from './fixtures/ids';

describe('Admin analytics (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const prismaMock = {
      userRole: {
        findMany: jest.fn(async (args: any) => {
          const userId = args?.where?.userId;
          if (userId === ids.adminUser) return [{ role: { key: 'ADMIN' } }];
          return [{ role: { key: 'MEMBER' } }];
        }),
      },
    };

    const adminServiceMock: Pick<AdminService, any> = {
      analyticsOverview: jest.fn(async () => ({
        days: 30,
        since: new Date().toISOString(),
        kpis: {
          activeUsers: 10,
          newUsers: 4,
          onboardingCompleted: 2,
          onboardingCompletionRate: 0.5,
          ordersPaid: 1,
          downloads: 3,
          communityPosts: 2,
          communityComments: 5,
          retentionD1: 0.25,
          retentionD7: 0.1,
        },
        topEvents: [{ name: 'onboarding.completed', count: 2 }],
      })),
      analyticsTimeseries: jest.fn(async () => ({ metric: 'active_users', days: 7, since: new Date().toISOString(), items: [] })),
      analyticsFunnel: jest.fn(async () => ({ name: 'onboarding', days: 7, since: new Date().toISOString(), steps: [] })),
    } as any;

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: adminServiceMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: CACHE_MANAGER, useValue: createMemoryCache() },
        { provide: ConfigService, useValue: { get: jest.fn(() => '') } },
        { provide: PinoLogger, useValue: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } },
        Reflector,
        { provide: APP_GUARD, useClass: FakeAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidUnknownValues: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should require auth', async () => {
    await request(app.getHttpServer()).get('/admin/analytics/overview?days=30').expect(401);
  });

  it('should forbid non-admin', async () => {
    await request(app.getHttpServer())
      .get('/admin/analytics/overview?days=30')
      .set('x-test-user', `${ids.tenantA}:${ids.regularUser}`)
      .expect(403);
  });

  it('should return overview for admin', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/analytics/overview?days=30')
      .set('x-test-user', `${ids.tenantA}:${ids.adminUser}`)
      .expect(200);

    expect(res.body?.kpis?.activeUsers).toBe(10);
  });
});
