import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(tenantId: string, userId: string) {
    const [onboarding, continueWatching, ebooksCount, postsCount] = await Promise.all([
      this.prisma.onboardingState.findUnique({
        where: { userId },
        select: { step: true, completedAt: true, updatedAt: true },
      }),
      this.prisma.lessonProgress.findMany({
        where: { tenantId, userId, completedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 12,
        select: {
          lessonId: true,
          progressPercent: true,
          lastPositionSec: true,
          updatedAt: true,
          lesson: {
            select: {
              id: true,
              title: true,
              module: { select: { courseId: true, course: { select: { title: true } } } },
              video: { select: { pandaVideoId: true, durationSec: true } },
            },
          },
        },
      }),
      this.prisma.libraryItem.count({ where: { tenantId, userId, revokedAt: null } }),
      this.prisma.communityPost.count({ where: { tenantId, authorId: userId, status: 'PUBLISHED' } }),
    ]);

    return {
      onboarding,
      continueWatching,
      stats: {
        ebooksCount,
        postsCount,
      },
    };
  }
}
