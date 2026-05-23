import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MentorshipService {
  constructor(private readonly prisma: PrismaService) {}

  async listOffers(tenantId: string) {
    return this.prisma.mentorshipOffer.findMany({
      where: { tenantId, status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, description: true, metadata: true },
    });
  }

  async my(tenantId: string, userId: string) {
    const enrollments = await this.prisma.mentorshipEnrollment.findMany({
      where: { tenantId, userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        unlockedAt: true,
        offer: { select: { id: true, name: true, description: true } },
        sessions: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, scheduledAt: true, startedAt: true, endedAt: true, meetingUrl: true, notes: true },
        },
      },
    });
    return { enrollments };
  }

  async schedule(params: { tenantId: string; userId: string; offerId: string; scheduledAt: Date; meetingUrl?: string }) {
    const enrollment = await this.prisma.mentorshipEnrollment.findUnique({
      where: { userId_offerId: { userId: params.userId, offerId: params.offerId } },
      select: { id: true, tenantId: true, unlockedAt: true, revokedAt: true },
    });
    if (!enrollment || enrollment.tenantId !== params.tenantId) throw new NotFoundException();
    if (!enrollment.unlockedAt || enrollment.revokedAt) throw new ForbiddenException();

    const session = await this.prisma.mentorshipSession.create({
      data: {
        tenantId: params.tenantId,
        enrollmentId: enrollment.id,
        userId: params.userId,
        scheduledAt: params.scheduledAt,
        meetingUrl: params.meetingUrl ?? null,
      },
      select: { id: true, scheduledAt: true, meetingUrl: true },
    });

    await this.prisma.notification.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        channel: 'IN_APP',
        status: 'PENDING',
        type: 'mentorship.session_scheduled',
        title: 'Mentoria agendada',
        body: 'Sua mentoria foi agendada com sucesso.',
        payload: { sessionId: session.id, scheduledAt: session.scheduledAt },
      },
    });

    await this.prisma.outboxEvent.create({
      data: {
        tenantId: params.tenantId,
        topic: 'mentorship.session_scheduled',
        payload: { userId: params.userId, offerId: params.offerId, sessionId: session.id, scheduledAt: session.scheduledAt, meetingUrl: session.meetingUrl },
      },
      select: { id: true },
    });

    return session;
  }
}
