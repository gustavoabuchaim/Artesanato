import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async metrics(tenantId: string) {
    const [users, ordersPending, ordersPaid, webhookFailed, posts, downloads] = await Promise.all([
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.order.count({ where: { tenantId, status: 'PENDING' } }),
      this.prisma.order.count({ where: { tenantId, status: 'PAID' } }),
      this.prisma.webhookEvent.count({ where: { tenantId, status: 'FAILED' } }),
      this.prisma.communityPost.count({ where: { tenantId, status: 'PUBLISHED' } }),
      this.prisma.ebookDownload.count({ where: { tenantId } }),
    ]);

    return { users, ordersPending, ordersPaid, webhookFailed, posts, downloads };
  }

  private clampDays(days: number) {
    const n = Math.floor(days);
    if (!Number.isFinite(n)) return 30;
    return Math.min(Math.max(n, 1), 180);
  }

  async analyticsOverview(params: { tenantId: string; days: number }) {
    const days = this.clampDays(params.days);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [newUsers, onboardingCompleted, ordersPaid, downloads, posts, comments] = await Promise.all([
      this.prisma.user.count({ where: { tenantId: params.tenantId, createdAt: { gte: since } } }),
      this.prisma.onboardingState.count({ where: { tenantId: params.tenantId, completedAt: { gte: since } } }),
      this.prisma.order.count({ where: { tenantId: params.tenantId, status: 'PAID', updatedAt: { gte: since } } }),
      this.prisma.ebookDownload.count({ where: { tenantId: params.tenantId, createdAt: { gte: since } } }),
      this.prisma.communityPost.count({ where: { tenantId: params.tenantId, createdAt: { gte: since } } }),
      this.prisma.communityComment.count({ where: { tenantId: params.tenantId, createdAt: { gte: since } } }),
    ]);

    const activeUserRows = await this.prisma.analyticsEvent.findMany({
      where: { tenantId: params.tenantId, userId: { not: null }, createdAt: { gte: since } },
      distinct: ['userId'],
      select: { userId: true },
      take: 500_000,
    });
    const activeUsers = activeUserRows.length;

    const topEvents = await this.prisma.analyticsEvent.groupBy({
      by: ['name'],
      where: { tenantId: params.tenantId, createdAt: { gte: since } },
      _count: { name: true },
      orderBy: { _count: { name: 'desc' } },
      take: 12,
    });

    const [d1, d7] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ cohort_size: bigint; retained: bigint }>
      >(Prisma.sql`
        SELECT
          COUNT(*)::bigint AS cohort_size,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM "AnalyticsEvent" e
              WHERE e."tenantId" = ${params.tenantId}::uuid
                AND e."userId" = u."id"
                AND e."createdAt" >= (u."createdAt" + interval '1 day')
                AND e."createdAt" <  (u."createdAt" + interval '2 day')
            )
          )::bigint AS retained
        FROM "User" u
        WHERE u."tenantId" = ${params.tenantId}::uuid
          AND u."createdAt" >= ${since}::timestamptz
          AND u."createdAt" < (now() - interval '1 day')
      `),
      this.prisma.$queryRaw<
        Array<{ cohort_size: bigint; retained: bigint }>
      >(Prisma.sql`
        SELECT
          COUNT(*)::bigint AS cohort_size,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM "AnalyticsEvent" e
              WHERE e."tenantId" = ${params.tenantId}::uuid
                AND e."userId" = u."id"
                AND e."createdAt" >= (u."createdAt" + interval '7 day')
                AND e."createdAt" <  (u."createdAt" + interval '8 day')
            )
          )::bigint AS retained
        FROM "User" u
        WHERE u."tenantId" = ${params.tenantId}::uuid
          AND u."createdAt" >= ${since}::timestamptz
          AND u."createdAt" < (now() - interval '7 day')
      `),
    ]);

    const d1Cohort = Number(d1?.[0]?.cohort_size ?? 0n);
    const d1Retained = Number(d1?.[0]?.retained ?? 0n);
    const d7Cohort = Number(d7?.[0]?.cohort_size ?? 0n);
    const d7Retained = Number(d7?.[0]?.retained ?? 0n);

    return {
      days,
      since,
      kpis: {
        activeUsers,
        newUsers,
        onboardingCompleted,
        onboardingCompletionRate: newUsers > 0 ? onboardingCompleted / newUsers : 0,
        ordersPaid,
        downloads,
        communityPosts: posts,
        communityComments: comments,
        retentionD1: d1Cohort > 0 ? d1Retained / d1Cohort : 0,
        retentionD7: d7Cohort > 0 ? d7Retained / d7Cohort : 0,
      },
      topEvents: topEvents.map((e) => ({ name: e.name, count: e._count.name })),
    };
  }

  async analyticsTimeseries(params: { tenantId: string; metric: string; days: number }) {
    const days = this.clampDays(params.days);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const metric = (params.metric ?? '').toLowerCase().trim();

    const allowed = new Set([
      'active_users',
      'events',
      'pageviews',
      'purchases_paid',
      'downloads',
      'community_posts',
      'community_comments',
    ]);
    if (!allowed.has(metric)) throw new BadRequestException('metric inválida');

    const rows =
      metric === 'active_users'
        ? await this.prisma.$queryRaw<Array<{ day: Date; value: bigint }>>(Prisma.sql`
            SELECT date_trunc('day', e."createdAt") AS day, COUNT(DISTINCT e."userId")::bigint AS value
            FROM "AnalyticsEvent" e
            WHERE e."tenantId" = ${params.tenantId}::uuid
              AND e."userId" IS NOT NULL
              AND e."createdAt" >= ${since}::timestamptz
            GROUP BY 1
            ORDER BY 1 ASC
          `)
        : metric === 'events'
          ? await this.prisma.$queryRaw<Array<{ day: Date; value: bigint }>>(Prisma.sql`
              SELECT date_trunc('day', e."createdAt") AS day, COUNT(*)::bigint AS value
              FROM "AnalyticsEvent" e
              WHERE e."tenantId" = ${params.tenantId}::uuid
                AND e."createdAt" >= ${since}::timestamptz
              GROUP BY 1
              ORDER BY 1 ASC
            `)
          : metric === 'pageviews'
            ? await this.prisma.$queryRaw<Array<{ day: Date; value: bigint }>>(Prisma.sql`
                SELECT date_trunc('day', p."createdAt") AS day, COUNT(*)::bigint AS value
                FROM "PageView" p
                WHERE p."tenantId" = ${params.tenantId}::uuid
                  AND p."createdAt" >= ${since}::timestamptz
                GROUP BY 1
                ORDER BY 1 ASC
              `)
            : metric === 'purchases_paid'
              ? await this.prisma.$queryRaw<Array<{ day: Date; value: bigint }>>(Prisma.sql`
                  SELECT date_trunc('day', o."updatedAt") AS day, COUNT(*)::bigint AS value
                  FROM "Order" o
                  WHERE o."tenantId" = ${params.tenantId}::uuid
                    AND o."status" = 'PAID'
                    AND o."updatedAt" >= ${since}::timestamptz
                  GROUP BY 1
                  ORDER BY 1 ASC
                `)
              : metric === 'downloads'
                ? await this.prisma.$queryRaw<Array<{ day: Date; value: bigint }>>(Prisma.sql`
                    SELECT date_trunc('day', d."createdAt") AS day, COUNT(*)::bigint AS value
                    FROM "EbookDownload" d
                    WHERE d."tenantId" = ${params.tenantId}::uuid
                      AND d."createdAt" >= ${since}::timestamptz
                    GROUP BY 1
                    ORDER BY 1 ASC
                  `)
                : metric === 'community_posts'
                  ? await this.prisma.$queryRaw<Array<{ day: Date; value: bigint }>>(Prisma.sql`
                      SELECT date_trunc('day', p."createdAt") AS day, COUNT(*)::bigint AS value
                      FROM "CommunityPost" p
                      WHERE p."tenantId" = ${params.tenantId}::uuid
                        AND p."createdAt" >= ${since}::timestamptz
                      GROUP BY 1
                      ORDER BY 1 ASC
                    `)
                  : await this.prisma.$queryRaw<Array<{ day: Date; value: bigint }>>(Prisma.sql`
                      SELECT date_trunc('day', c."createdAt") AS day, COUNT(*)::bigint AS value
                      FROM "CommunityComment" c
                      WHERE c."tenantId" = ${params.tenantId}::uuid
                        AND c."createdAt" >= ${since}::timestamptz
                      GROUP BY 1
                      ORDER BY 1 ASC
                    `);

    const valueByDay = new Map<string, number>();
    for (const r of rows) {
      const day = new Date(r.day);
      const key = day.toISOString().slice(0, 10);
      valueByDay.set(key, Number(r.value));
    }

    const items: Array<{ date: string; value: number }> = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      items.push({ date: key, value: valueByDay.get(key) ?? 0 });
    }

    return { metric, days, since, items };
  }

  async analyticsFunnel(params: { tenantId: string; name: string; days: number }) {
    const days = this.clampDays(params.days);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const name = (params.name ?? '').toLowerCase().trim();

    if (name === 'onboarding') {
      const [steps, completed] = await Promise.all([
        this.prisma.$queryRaw<Array<{ step1: bigint; step2: bigint; step3: bigint }>>(Prisma.sql`
          WITH s AS (
            SELECT e."userId" AS user_id, MAX((e."properties"->>'step')::int) AS max_step
            FROM "AnalyticsEvent" e
            WHERE e."tenantId" = ${params.tenantId}::uuid
              AND e."name" = 'onboarding.step'
              AND e."userId" IS NOT NULL
              AND e."createdAt" >= ${since}::timestamptz
              AND e."properties" ? 'step'
            GROUP BY 1
          )
          SELECT
            COUNT(*) FILTER (WHERE max_step >= 1)::bigint AS step1,
            COUNT(*) FILTER (WHERE max_step >= 2)::bigint AS step2,
            COUNT(*) FILTER (WHERE max_step >= 3)::bigint AS step3
          FROM s
        `),
        this.prisma.$queryRaw<Array<{ users: bigint }>>(Prisma.sql`
          SELECT COUNT(DISTINCT e."userId")::bigint AS users
          FROM "AnalyticsEvent" e
          WHERE e."tenantId" = ${params.tenantId}::uuid
            AND e."name" = 'onboarding.completed'
            AND e."userId" IS NOT NULL
            AND e."createdAt" >= ${since}::timestamptz
        `),
      ]);

      return {
        name,
        days,
        since,
        steps: [
          { step: 'Step 1', users: Number(steps?.[0]?.step1 ?? 0n) },
          { step: 'Step 2', users: Number(steps?.[0]?.step2 ?? 0n) },
          { step: 'Step 3', users: Number(steps?.[0]?.step3 ?? 0n) },
          { step: 'Completed', users: Number(completed?.[0]?.users ?? 0n) },
        ],
      };
    }

    if (name === 'purchase') {
      const [checkout, paid] = await Promise.all([
        this.prisma.$queryRaw<Array<{ users: bigint }>>(Prisma.sql`
          SELECT COUNT(DISTINCT e."userId")::bigint AS users
          FROM "AnalyticsEvent" e
          WHERE e."tenantId" = ${params.tenantId}::uuid
            AND e."name" = 'purchase.checkout_created'
            AND e."userId" IS NOT NULL
            AND e."createdAt" >= ${since}::timestamptz
        `),
        this.prisma.$queryRaw<Array<{ users: bigint }>>(Prisma.sql`
          SELECT COUNT(DISTINCT e."userId")::bigint AS users
          FROM "AnalyticsEvent" e
          WHERE e."tenantId" = ${params.tenantId}::uuid
            AND e."name" = 'purchase.paid'
            AND e."userId" IS NOT NULL
            AND e."createdAt" >= ${since}::timestamptz
        `),
      ]);

      return {
        name,
        days,
        since,
        steps: [
          { step: 'Checkout', users: Number(checkout?.[0]?.users ?? 0n) },
          { step: 'Paid', users: Number(paid?.[0]?.users ?? 0n) },
        ],
      };
    }

    throw new BadRequestException('funnel inválido');
  }

  async listUsers(params: {
    tenantId: string;
    page?: number;
    limit?: number;
    query?: string;
    status?: string;
    roleKey?: string;
  }) {
    const take = Math.min(Math.max(params.limit ?? 20, 1), 50);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * take;
    const q = params.query?.trim();

    const where: Prisma.UserWhereInput = {
      tenantId: params.tenantId,
      ...(params.status ? { status: params.status as never } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(params.roleKey ? { roles: { some: { role: { key: params.roleKey } } } } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          createdAt: true,
          roles: { select: { role: { select: { key: true, name: true } } } },
        },
      }),
    ]);

    return {
      page,
      limit: take,
      total,
      items: items.map((u) => ({
        ...u,
        roles: u.roles.map((r) => r.role),
      })),
    };
  }

  async updateUser(params: { tenantId: string; actorUserId: string; userId: string; name?: string; status?: string }) {
    const user = await this.prisma.user.findFirst({
      where: { tenantId: params.tenantId, id: params.userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException();

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(typeof params.name === 'string' ? { name: params.name } : {}),
        ...(typeof params.status === 'string' ? { status: params.status as never } : {}),
      },
      select: { id: true, email: true, name: true, status: true, updatedAt: true },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        targetUserId: params.userId,
        action: 'user.updated',
        targetType: 'User',
        targetId: params.userId,
        metadata: { name: params.name, status: params.status },
      },
      select: { id: true },
    });

    return updated;
  }

  async setUserRoles(params: { tenantId: string; actorUserId: string; userId: string; roleKeys: string[] }) {
    if (!Array.isArray(params.roleKeys) || params.roleKeys.length === 0) {
      throw new BadRequestException('roleKeys_required');
    }

    const user = await this.prisma.user.findFirst({
      where: { tenantId: params.tenantId, id: params.userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException();

    const roles = await this.prisma.role.findMany({
      where: { tenantId: params.tenantId, key: { in: params.roleKeys } },
      select: { id: true, key: true },
    });
    if (roles.length !== params.roleKeys.length) throw new BadRequestException('invalid_roles');

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: params.userId } }),
      this.prisma.userRole.createMany({
        data: roles.map((r) => ({ tenantId: params.tenantId, userId: params.userId, roleId: r.id })),
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: params.tenantId,
          actorUserId: params.actorUserId,
          targetUserId: params.userId,
          action: 'user.roles_set',
          targetType: 'User',
          targetId: params.userId,
          metadata: { roleKeys: params.roleKeys },
        },
        select: { id: true },
      }),
    ]);

    return { ok: true };
  }

  async listCourses(params: { tenantId: string; page?: number; limit?: number; query?: string; status?: string }) {
    const take = Math.min(Math.max(params.limit ?? 20, 1), 50);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * take;
    const q = params.query?.trim();
    const where: Prisma.CourseWhereInput = {
      tenantId: params.tenantId,
      ...(params.status ? { status: params.status as never } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          visibility: true,
          publishedAt: true,
          updatedAt: true,
          modules: { select: { id: true } },
        },
      }),
    ]);

    return {
      page,
      limit: take,
      total,
      items: items.map((c) => ({ ...c, modulesCount: c.modules.length })),
    };
  }

  async upsertCourse(params: {
    tenantId: string;
    actorUserId: string;
    courseId?: string;
    title: string;
    description?: string;
    status?: string;
    visibility?: string;
    coverFileId?: string;
  }) {
    if (!params.title?.trim()) throw new BadRequestException('title_required');
    const data: Prisma.CourseUncheckedCreateInput & Prisma.CourseUncheckedUpdateInput = {
      tenantId: params.tenantId,
      title: params.title.trim(),
      description: params.description?.trim() || null,
      ...(params.status ? { status: params.status as never } : {}),
      ...(params.visibility ? { visibility: params.visibility as never } : {}),
      ...(params.coverFileId ? { coverFileId: params.coverFileId } : {}),
    };

    const saved = params.courseId
      ? await this.prisma.course.update({
          where: { id: params.courseId },
          data,
          select: { id: true, title: true, status: true, visibility: true, updatedAt: true },
        })
      : await this.prisma.course.create({
          data,
          select: { id: true, title: true, status: true, visibility: true, createdAt: true },
        });

    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        action: params.courseId ? 'course.updated' : 'course.created',
        targetType: 'Course',
        targetId: saved.id,
        metadata: { title: params.title, status: params.status, visibility: params.visibility },
      },
      select: { id: true },
    });

    return saved;
  }

  async createCourseModule(params: { tenantId: string; actorUserId: string; courseId: string; title: string; sortOrder?: number }) {
    if (!params.title?.trim()) throw new BadRequestException('title_required');
    const course = await this.prisma.course.findFirst({ where: { tenantId: params.tenantId, id: params.courseId }, select: { id: true } });
    if (!course) throw new NotFoundException();

    const created = await this.prisma.courseModule.create({
      data: { tenantId: params.tenantId, courseId: params.courseId, title: params.title.trim(), sortOrder: params.sortOrder ?? 0 },
      select: { id: true, title: true, sortOrder: true, createdAt: true },
    });

    await this.prisma.auditLog.create({
      data: { tenantId: params.tenantId, actorUserId: params.actorUserId, action: 'course_module.created', targetType: 'CourseModule', targetId: created.id, metadata: { courseId: params.courseId } },
      select: { id: true },
    });

    return created;
  }

  async createLesson(params: { tenantId: string; actorUserId: string; moduleId: string; title: string; type?: string; status?: string; sortOrder?: number }) {
    if (!params.title?.trim()) throw new BadRequestException('title_required');
    const module = await this.prisma.courseModule.findFirst({ where: { tenantId: params.tenantId, id: params.moduleId }, select: { id: true, courseId: true } });
    if (!module) throw new NotFoundException();

    const created = await this.prisma.lesson.create({
      data: {
        tenantId: params.tenantId,
        moduleId: params.moduleId,
        title: params.title.trim(),
        type: (params.type ?? 'VIDEO') as never,
        status: (params.status ?? 'DRAFT') as never,
        sortOrder: params.sortOrder ?? 0,
      },
      select: { id: true, title: true, type: true, status: true, sortOrder: true, createdAt: true },
    });

    await this.prisma.auditLog.create({
      data: { tenantId: params.tenantId, actorUserId: params.actorUserId, action: 'lesson.created', targetType: 'Lesson', targetId: created.id, metadata: { moduleId: params.moduleId, courseId: module.courseId } },
      select: { id: true },
    });

    return created;
  }

  async listLessons(params: { tenantId: string; page?: number; limit?: number; query?: string; status?: string; courseId?: string }) {
    const take = Math.min(Math.max(params.limit ?? 20, 1), 50);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * take;
    const q = params.query?.trim();

    const where: Prisma.LessonWhereInput = {
      tenantId: params.tenantId,
      ...(params.status ? { status: params.status as never } : {}),
      ...(params.courseId ? { module: { courseId: params.courseId } } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.lesson.count({ where }),
      this.prisma.lesson.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          sortOrder: true,
          updatedAt: true,
          module: { select: { id: true, title: true, course: { select: { id: true, title: true } } } },
          video: { select: { pandaVideoId: true, durationSec: true } },
        },
      }),
    ]);

    return { page, limit: take, total, items };
  }

  async listCuration(params: { tenantId: string; page?: number; limit?: number; query?: string; status?: string }) {
    const take = Math.min(Math.max(params.limit ?? 20, 1), 50);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * take;
    const q = params.query?.trim();

    const where: Prisma.CurationItemWhereInput = {
      tenantId: params.tenantId,
      ...(params.status ? { status: params.status as never } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.curationItem.count({ where }),
      this.prisma.curationItem.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take,
        select: { id: true, title: true, url: true, tag: true, status: true, publishedAt: true, updatedAt: true },
      }),
    ]);

    return { page, limit: take, total, items };
  }

  async upsertCuration(params: { tenantId: string; actorUserId: string; itemId?: string; title: string; url: string; tag?: string; description?: string; status?: string }) {
    if (!params.title?.trim()) throw new BadRequestException('title_required');
    if (!params.url?.trim()) throw new BadRequestException('url_required');

    const data: Prisma.CurationItemUncheckedCreateInput & Prisma.CurationItemUncheckedUpdateInput = {
      tenantId: params.tenantId,
      title: params.title.trim(),
      url: params.url.trim(),
      tag: params.tag?.trim() || null,
      description: params.description?.trim() || null,
      ...(params.status ? { status: params.status as never } : {}),
    };

    const saved = params.itemId
      ? await this.prisma.curationItem.update({ where: { id: params.itemId }, data, select: { id: true, title: true, url: true, status: true, updatedAt: true } })
      : await this.prisma.curationItem.create({ data, select: { id: true, title: true, url: true, status: true, createdAt: true } });

    await this.prisma.auditLog.create({
      data: { tenantId: params.tenantId, actorUserId: params.actorUserId, action: params.itemId ? 'curation.updated' : 'curation.created', targetType: 'CurationItem', targetId: saved.id },
      select: { id: true },
    });

    return saved;
  }

  async deleteCuration(params: { tenantId: string; actorUserId: string; itemId: string }) {
    const item = await this.prisma.curationItem.findFirst({ where: { tenantId: params.tenantId, id: params.itemId }, select: { id: true } });
    if (!item) throw new NotFoundException();
    await this.prisma.curationItem.delete({ where: { id: item.id } });
    await this.prisma.auditLog.create({ data: { tenantId: params.tenantId, actorUserId: params.actorUserId, action: 'curation.deleted', targetType: 'CurationItem', targetId: params.itemId }, select: { id: true } });
    return { ok: true };
  }

  async listMentorshipOffersAdmin(params: { tenantId: string; page?: number; limit?: number; query?: string; status?: string }) {
    const take = Math.min(Math.max(params.limit ?? 20, 1), 50);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * take;
    const q = params.query?.trim();

    const where: Prisma.MentorshipOfferWhereInput = {
      tenantId: params.tenantId,
      ...(params.status ? { status: params.status as never } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.mentorshipOffer.count({ where }),
      this.prisma.mentorshipOffer.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        select: { id: true, name: true, description: true, status: true, updatedAt: true, createdAt: true },
      }),
    ]);

    return { page, limit: take, total, items };
  }

  async upsertMentorshipOffer(params: { tenantId: string; actorUserId: string; offerId?: string; name: string; description?: string; status?: string }) {
    if (!params.name?.trim()) throw new BadRequestException('name_required');
    const data: Prisma.MentorshipOfferUncheckedCreateInput & Prisma.MentorshipOfferUncheckedUpdateInput = {
      tenantId: params.tenantId,
      name: params.name.trim(),
      description: params.description?.trim() || null,
      ...(params.status ? { status: params.status as never } : {}),
    };

    const saved = params.offerId
      ? await this.prisma.mentorshipOffer.update({ where: { id: params.offerId }, data, select: { id: true, name: true, status: true, updatedAt: true } })
      : await this.prisma.mentorshipOffer.create({ data, select: { id: true, name: true, status: true, createdAt: true } });

    await this.prisma.auditLog.create({
      data: { tenantId: params.tenantId, actorUserId: params.actorUserId, action: params.offerId ? 'mentorship_offer.updated' : 'mentorship_offer.created', targetType: 'MentorshipOffer', targetId: saved.id },
      select: { id: true },
    });
    return saved;
  }

  async sendNotification(params: { tenantId: string; actorUserId: string; userId: string; type: string; title?: string; body?: string }) {
    const user = await this.prisma.user.findFirst({ where: { tenantId: params.tenantId, id: params.userId }, select: { id: true } });
    if (!user) throw new NotFoundException();

    const created = await this.prisma.notification.create({
      data: { tenantId: params.tenantId, userId: params.userId, type: params.type, title: params.title ?? null, body: params.body ?? null, status: 'PENDING' },
      select: { id: true },
    });

    await this.prisma.auditLog.create({
      data: { tenantId: params.tenantId, actorUserId: params.actorUserId, targetUserId: params.userId, action: 'notification.sent', targetType: 'Notification', targetId: created.id, metadata: { type: params.type } },
      select: { id: true },
    });

    return { ok: true, id: created.id };
  }

  async broadcastNotification(params: { tenantId: string; actorUserId: string; type: string; title?: string; body?: string; limit?: number }) {
    const take = Math.min(Math.max(params.limit ?? 500, 1), 2000);
    const users = await this.prisma.user.findMany({ where: { tenantId: params.tenantId, status: 'ACTIVE' }, take, select: { id: true } });
    if (!users.length) return { ok: true, sent: 0 };

    const rows = users.map((u) => ({ tenantId: params.tenantId, userId: u.id, type: params.type, title: params.title ?? null, body: params.body ?? null, status: 'PENDING' as const }));
    await this.prisma.notification.createMany({ data: rows });

    await this.prisma.auditLog.create({
      data: { tenantId: params.tenantId, actorUserId: params.actorUserId, action: 'notification.broadcast', targetType: 'Notification', targetId: params.tenantId, metadata: { type: params.type, sent: users.length } },
      select: { id: true },
    });

    return { ok: true, sent: users.length };
  }

  async setCoursePublished(params: { tenantId: string; actorUserId: string; courseId: string; published: boolean }) {
    const course = await this.prisma.course.findFirst({
      where: { tenantId: params.tenantId, id: params.courseId },
      select: { id: true, publishedAt: true },
    });
    if (!course) throw new NotFoundException();

    const updated = await this.prisma.course.update({
      where: { id: course.id },
      data: {
        status: params.published ? 'PUBLISHED' : 'DRAFT',
        publishedAt: params.published ? new Date() : null,
      },
      select: { id: true, status: true, publishedAt: true },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        action: params.published ? 'course.published' : 'course.unpublished',
        targetType: 'Course',
        targetId: course.id,
        metadata: { published: params.published },
      },
      select: { id: true },
    });

    return updated;
  }

  async listEbooks(params: { tenantId: string; page?: number; limit?: number; query?: string; status?: string }) {
    const take = Math.min(Math.max(params.limit ?? 20, 1), 50);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * take;
    const q = params.query?.trim();
    const where: Prisma.EbookWhereInput = {
      tenantId: params.tenantId,
      ...(params.status ? { status: params.status as never } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.ebook.count({ where }),
      this.prisma.ebook.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        select: { id: true, title: true, description: true, status: true, publishedAt: true, coverFileId: true, fileId: true },
      }),
    ]);

    return { page, limit: take, total, items };
  }

  async upsertEbook(params: {
    tenantId: string;
    actorUserId: string;
    ebookId?: string;
    title: string;
    description?: string;
    status?: string;
    coverFileId?: string;
    fileId?: string;
  }) {
    if (!params.title?.trim()) throw new BadRequestException('title_required');
    const data: Prisma.EbookUncheckedCreateInput & Prisma.EbookUncheckedUpdateInput = {
      tenantId: params.tenantId,
      title: params.title.trim(),
      description: params.description?.trim() || null,
      ...(params.status ? { status: params.status as never } : {}),
      ...(params.coverFileId ? { coverFileId: params.coverFileId } : {}),
      ...(params.fileId ? { fileId: params.fileId } : {}),
    };

    const saved = params.ebookId
      ? await this.prisma.ebook.update({
          where: { id: params.ebookId },
          data,
          select: { id: true, title: true, status: true, updatedAt: true },
        })
      : await this.prisma.ebook.create({
          data,
          select: { id: true, title: true, status: true, createdAt: true },
        });

    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        action: params.ebookId ? 'ebook.updated' : 'ebook.created',
        targetType: 'Ebook',
        targetId: saved.id,
        metadata: { title: params.title, status: params.status },
      },
      select: { id: true },
    });

    return saved;
  }

  async setEbookPublished(params: { tenantId: string; actorUserId: string; ebookId: string; published: boolean }) {
    const ebook = await this.prisma.ebook.findFirst({
      where: { tenantId: params.tenantId, id: params.ebookId },
      select: { id: true },
    });
    if (!ebook) throw new NotFoundException();

    const updated = await this.prisma.ebook.update({
      where: { id: ebook.id },
      data: { status: params.published ? 'PUBLISHED' : 'DRAFT', publishedAt: params.published ? new Date() : null },
      select: { id: true, status: true, publishedAt: true },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        action: params.published ? 'ebook.published' : 'ebook.unpublished',
        targetType: 'Ebook',
        targetId: ebook.id,
        metadata: { published: params.published },
      },
      select: { id: true },
    });

    return updated;
  }

  async listOrders(params: { tenantId: string; page?: number; limit?: number; status?: string; query?: string; provider?: string }) {
    const take = Math.min(Math.max(params.limit ?? 20, 1), 50);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * take;
    const q = params.query?.trim();

    const looksLikeUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    const where: Prisma.OrderWhereInput = {
      tenantId: params.tenantId,
      ...(params.status ? { status: params.status as never } : {}),
      ...(q
        ? {
            OR: [
              ...(looksLikeUuid(q) ? [{ id: q }] : []),
              { providerCheckoutRef: { contains: q, mode: 'insensitive' } },
              { user: { email: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(params.provider ? { payments: { some: { provider: params.provider as never } } } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          status: true,
          totalCents: true,
          currency: true,
          createdAt: true,
          user: { select: { id: true, email: true, name: true } },
          items: { select: { quantity: true, product: { select: { name: true, type: true } } } },
          payments: { select: { provider: true, status: true, createdAt: true } },
        },
      }),
    ]);

    return { page, limit: take, total, items };
  }

  async listUploads(params: { tenantId: string; page?: number; limit?: number; status?: string; purpose?: string; query?: string }) {
    const take = Math.min(Math.max(params.limit ?? 20, 1), 50);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * take;
    const q = params.query?.trim();

    const looksLikeUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    const where: Prisma.UploadSessionWhereInput = {
      tenantId: params.tenantId,
      ...(params.status ? { status: params.status as never } : {}),
      ...(params.purpose ? { filePurpose: params.purpose as never } : {}),
      ...(q
        ? {
            OR: [
              { originalFilename: { contains: q, mode: 'insensitive' } },
              ...(looksLikeUuid(q) ? [{ id: q }] : []),
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.uploadSession.count({ where }),
      this.prisma.uploadSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          status: true,
          filePurpose: true,
          originalFilename: true,
          expectedSizeBytes: true,
          createdAt: true,
          completedAt: true,
          user: { select: { id: true, email: true } },
          file: { select: { id: true, r2Key: true, mimeType: true, sizeBytes: true } },
        },
      }),
    ]);

    return { page, limit: take, total, items };
  }

  async listCarousel(params: { tenantId: string; page?: number; limit?: number; status?: string; query?: string }) {
    const take = Math.min(Math.max(params.limit ?? 20, 1), 50);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * take;
    const q = params.query?.trim();
    const where: Prisma.CarouselItemWhereInput = {
      tenantId: params.tenantId,
      ...(params.status ? { status: params.status as never } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.carouselItem.count({ where }),
      this.prisma.carouselItem.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          title: true,
          subtitle: true,
          ctaLabel: true,
          ctaUrl: true,
          status: true,
          sortOrder: true,
          publishedAt: true,
          imageFileId: true,
          mobileImageFileId: true,
          backgroundColor: true,
          updatedAt: true,
        },
      }),
    ]);
    return { page, limit: take, total, items };
  }

  async upsertCarouselItem(params: {
    tenantId: string;
    actorUserId: string;
    itemId?: string;
    title: string;
    subtitle?: string;
    ctaLabel?: string;
    ctaUrl?: string;
    imageFileId?: string;
    mobileImageFileId?: string;
    backgroundColor?: string;
    status?: string;
    sortOrder?: number;
  }) {
    if (!params.title?.trim()) throw new BadRequestException('title_required');
    const data: Prisma.CarouselItemUncheckedCreateInput & Prisma.CarouselItemUncheckedUpdateInput = {
      tenantId: params.tenantId,
      title: params.title.trim(),
      subtitle: params.subtitle?.trim() || null,
      ctaLabel: params.ctaLabel?.trim() || null,
      ctaUrl: params.ctaUrl?.trim() || null,
      imageFileId: params.imageFileId ?? null,
      mobileImageFileId: params.mobileImageFileId ?? null,
      backgroundColor: params.backgroundColor?.trim() || null,
      ...(typeof params.sortOrder === 'number' ? { sortOrder: params.sortOrder } : {}),
      ...(params.status ? { status: params.status as never } : {}),
    };

    const saved = params.itemId
      ? await this.prisma.carouselItem.update({
          where: { id: params.itemId },
          data,
          select: { id: true, title: true, status: true, sortOrder: true, updatedAt: true },
        })
      : await this.prisma.carouselItem.create({
          data,
          select: { id: true, title: true, status: true, sortOrder: true, createdAt: true },
        });

    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        action: params.itemId ? 'carousel.updated' : 'carousel.created',
        targetType: 'CarouselItem',
        targetId: saved.id,
        metadata: { title: params.title, status: params.status, sortOrder: params.sortOrder },
      },
      select: { id: true },
    });

    return saved;
  }

  async deleteCarouselItem(params: { tenantId: string; actorUserId: string; itemId: string }) {
    const item = await this.prisma.carouselItem.findFirst({
      where: { tenantId: params.tenantId, id: params.itemId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException();

    await this.prisma.carouselItem.delete({ where: { id: item.id } });
    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        action: 'carousel.deleted',
        targetType: 'CarouselItem',
        targetId: params.itemId,
      },
      select: { id: true },
    });
    return { ok: true };
  }

  async adminSearch(params: { tenantId: string; query: string }) {
    const q = params.query.trim();
    if (!q) return { users: [], courses: [], ebooks: [], orders: [], posts: [] };

    const looksLikeUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    const [users, courses, ebooks, orders, posts] = await Promise.all([
      this.prisma.user.findMany({
        where: { tenantId: params.tenantId, OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] },
        take: 8,
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, name: true, status: true },
      }),
      this.prisma.course.findMany({
        where: { tenantId: params.tenantId, title: { contains: q, mode: 'insensitive' } },
        take: 8,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, status: true },
      }),
      this.prisma.ebook.findMany({
        where: { tenantId: params.tenantId, title: { contains: q, mode: 'insensitive' } },
        take: 8,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, status: true },
      }),
      this.prisma.order.findMany({
        where: {
          tenantId: params.tenantId,
          OR: [
            ...(looksLikeUuid(q) ? [{ id: q }] : []),
            { providerCheckoutRef: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
          ],
        },
        take: 8,
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, totalCents: true, currency: true, user: { select: { email: true } } },
      }),
      this.prisma.communityPost.findMany({
        where: { tenantId: params.tenantId, OR: [{ title: { contains: q, mode: 'insensitive' } }, { body: { contains: q, mode: 'insensitive' } }] },
        take: 8,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, status: true, author: { select: { email: true, name: true } } },
      }),
    ]);

    return { users, courses, ebooks, orders, posts };
  }

  async grantEntitlement(params: {
    tenantId: string;
    actorUserId: string;
    userId: string;
    resourceType: string;
    resourceId: string;
    sourceRef?: string;
  }) {
    const ent = await this.prisma.entitlement.upsert({
      where: {
        userId_resourceType_resourceId: {
          userId: params.userId,
          resourceType: params.resourceType as never,
          resourceId: params.resourceId,
        },
      },
      update: { revokedAt: null, sourceType: 'ADMIN_GRANT', sourceRef: params.sourceRef ?? null },
      create: {
        tenantId: params.tenantId,
        userId: params.userId,
        resourceType: params.resourceType as never,
        resourceId: params.resourceId,
        sourceType: 'ADMIN_GRANT',
        sourceRef: params.sourceRef ?? null,
      },
      select: { id: true, resourceType: true, resourceId: true, grantedAt: true },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        targetUserId: params.userId,
        action: 'entitlement.granted',
        targetType: 'Entitlement',
        targetId: ent.id,
        metadata: { resourceType: ent.resourceType, resourceId: ent.resourceId },
      },
      select: { id: true },
    });

    return ent;
  }
}
