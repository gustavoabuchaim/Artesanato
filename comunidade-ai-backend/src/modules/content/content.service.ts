import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  async listCourses(tenantId: string) {
    return this.prisma.course.findMany({
      where: { tenantId, status: 'PUBLISHED' },
      select: { id: true, title: true, description: true, publishedAt: true, visibility: true },
      orderBy: { publishedAt: 'desc' },
    });
  }

  async getCourse(params: { tenantId: string; userId: string; courseId: string }) {
    const course = await this.prisma.course.findFirst({
      where: { tenantId: params.tenantId, id: params.courseId, status: 'PUBLISHED' },
      select: { id: true, title: true, description: true, publishedAt: true },
    });
    if (!course) throw new NotFoundException();

    await this.prisma.analyticsEvent.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        name: 'content.course_viewed',
        properties: { courseId: params.courseId } as never,
      },
      select: { id: true },
    });

    const modules = await this.prisma.courseModule.findMany({
      where: { tenantId: params.tenantId, courseId: params.courseId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        title: true,
        sortOrder: true,
        lessons: {
          where: { status: 'PUBLISHED' },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, title: true, type: true, sortOrder: true },
        },
      },
    });

    return { ...course, modules };
  }
}
