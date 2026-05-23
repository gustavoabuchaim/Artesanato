import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class VideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  async getPlayback(params: { tenantId: string; userId: string; lessonId: string }) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { tenantId: params.tenantId, id: params.lessonId, status: 'PUBLISHED' },
      select: {
        id: true,
        module: { select: { courseId: true } },
        video: { select: { pandaVideoId: true } },
      },
    });
    if (!lesson || !lesson.video) throw new NotFoundException();

    const hasAccess = await this.hasCourseAccess(params.tenantId, params.userId, lesson.module.courseId);
    if (!hasAccess) throw new ForbiddenException();

    return { pandaVideoId: lesson.video.pandaVideoId };
  }

  async initPandaTusUpload(params: {
    tenantId: string;
    lessonId: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    folderId?: string;
  }) {
    const apiKey = (this.config.get<string>('PANDAVIDEO_API_KEY') ?? '').trim();
    if (!apiKey) throw new Error('PANDAVIDEO_API_KEY não configurado');

    const tusEndpoint = (this.config.get<string>('PANDAVIDEO_TUS_ENDPOINT') ?? '').trim();
    if (!tusEndpoint) throw new Error('PANDAVIDEO_TUS_ENDPOINT não configurado');

    const lesson = await this.prisma.lesson.findFirst({
      where: { tenantId: params.tenantId, id: params.lessonId },
      select: { id: true },
    });
    if (!lesson) throw new NotFoundException();

    if (!params.filename || params.filename.length > 255) throw new BadRequestException('filename inválido');
    if (!params.contentType || params.contentType.length > 128) throw new BadRequestException('contentType inválido');
    if (!params.contentType.toLowerCase().startsWith('video/')) throw new BadRequestException('contentType inválido');
    if (!Number.isFinite(params.sizeBytes) || params.sizeBytes <= 0) throw new BadRequestException('sizeBytes inválido');
    if (params.sizeBytes > 5 * 1024 * 1024 * 1024) throw new BadRequestException('Arquivo muito grande');

    const pandaVideoId = crypto.randomUUID();

    const folderId = (params.folderId ?? this.config.get<string>('PANDAVIDEO_FOLDER_ID') ?? '').trim();
    const uploadMetadataPairs: Array<[string, string]> = [
      ['authorization', Buffer.from(apiKey, 'utf8').toString('base64')],
      ['filename', Buffer.from(params.filename, 'utf8').toString('base64')],
      ['video_id', Buffer.from(pandaVideoId, 'utf8').toString('base64')],
    ];
    if (folderId) uploadMetadataPairs.push(['folder_id', Buffer.from(folderId, 'utf8').toString('base64')]);

    const uploadMetadata = uploadMetadataPairs.map(([k, v]) => `${k} ${v}`).join(',');

    const resp = await fetch(tusEndpoint, {
      method: 'POST',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Length': params.sizeBytes.toString(),
        'Upload-Metadata': uploadMetadata,
      },
    });

    if (resp.status !== 201) {
      const body = await resp.text().catch(() => '');
      this.logger.error({ event: 'media.pandavideo_init_failed', status: resp.status, body }, 'Panda init upload failed');
      throw new BadRequestException('Falha ao iniciar upload');
    }

    const location = resp.headers.get('location') ?? resp.headers.get('Location');
    if (!location) throw new BadRequestException('Falha ao iniciar upload');

    await this.prisma.lessonVideo.upsert({
      where: { lessonId: params.lessonId },
      update: {
        tenantId: params.tenantId,
        pandaVideoId,
        metadata: {
          status: 'UPLOADING',
          filename: params.filename,
          contentType: params.contentType,
          sizeBytes: params.sizeBytes,
          folderId: folderId || null,
          tusEndpoint,
          location,
          createdAt: new Date().toISOString(),
        } as never,
      },
      create: {
        tenantId: params.tenantId,
        lessonId: params.lessonId,
        pandaVideoId,
        metadata: {
          status: 'UPLOADING',
          filename: params.filename,
          contentType: params.contentType,
          sizeBytes: params.sizeBytes,
          folderId: folderId || null,
          tusEndpoint,
          location,
          createdAt: new Date().toISOString(),
        } as never,
      },
      select: { id: true },
    });

    return {
      pandaVideoId,
      uploadUrl: location,
      tus: {
        resumable: '1.0.0',
        patchHeaders: {
          'Tus-Resumable': '1.0.0',
          'Upload-Offset': '0',
          'Content-Type': 'application/offset+octet-stream',
        },
      },
    };
  }

  async linkPandaVideo(params: { tenantId: string; lessonId: string; pandaVideoId: string; durationSec?: number; metadata?: unknown }) {
    const id = (params.pandaVideoId ?? '').trim();
    if (!id || id.length > 128) throw new BadRequestException('pandaVideoId inválido');

    const lesson = await this.prisma.lesson.findFirst({
      where: { tenantId: params.tenantId, id: params.lessonId },
      select: { id: true },
    });
    if (!lesson) throw new NotFoundException();

    await this.prisma.lessonVideo.upsert({
      where: { lessonId: params.lessonId },
      update: {
        tenantId: params.tenantId,
        pandaVideoId: id,
        durationSec: typeof params.durationSec === 'number' ? Math.max(0, Math.floor(params.durationSec)) : undefined,
        metadata: (params.metadata ?? undefined) as never,
      },
      create: {
        tenantId: params.tenantId,
        lessonId: params.lessonId,
        pandaVideoId: id,
        durationSec: typeof params.durationSec === 'number' ? Math.max(0, Math.floor(params.durationSec)) : null,
        metadata: (params.metadata ?? undefined) as never,
      },
      select: { id: true },
    });

    return { ok: true };
  }

  async trackWatchTime(params: {
    tenantId: string;
    userId: string;
    lessonId: string;
    secondsWatched: number;
    positionSec?: number;
    userAgent?: string;
    ip?: string;
  }) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { tenantId: params.tenantId, id: params.lessonId },
      select: { id: true, module: { select: { courseId: true } }, video: { select: { pandaVideoId: true } } },
    });
    if (!lesson || !lesson.video) throw new NotFoundException();

    const hasAccess = await this.hasCourseAccess(params.tenantId, params.userId, lesson.module.courseId);
    if (!hasAccess) throw new ForbiddenException();

    const seconds = Math.max(0, Math.min(60 * 60 * 4, Math.floor(params.secondsWatched)));
    if (!Number.isFinite(seconds) || seconds <= 0) throw new BadRequestException('secondsWatched inválido');

    await this.prisma.analyticsEvent.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        name: 'video.watch_time',
        properties: {
          lessonId: params.lessonId,
          pandaVideoId: lesson.video.pandaVideoId,
          secondsWatched: seconds,
          positionSec: typeof params.positionSec === 'number' ? Math.max(0, Math.floor(params.positionSec)) : null,
        } as never,
        userAgent: params.userAgent ?? null,
        ip: params.ip ?? null,
      },
      select: { id: true },
    });

    return { ok: true };
  }

  async trackProgress(params: {
    tenantId: string;
    userId: string;
    lessonId: string;
    positionSec?: number;
    progressPercent?: number;
    completed?: boolean;
  }) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { tenantId: params.tenantId, id: params.lessonId },
      select: { id: true, module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException();

    const hasAccess = await this.hasCourseAccess(params.tenantId, params.userId, lesson.module.courseId);
    if (!hasAccess) throw new ForbiddenException();

    const completedAt = params.completed ? new Date() : undefined;
    const progress = await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: params.userId, lessonId: params.lessonId } },
      update: {
        courseId: lesson.module.courseId,
        lastPositionSec: params.positionSec ?? undefined,
        progressPercent: params.progressPercent ?? undefined,
        completedAt,
      },
      create: {
        tenantId: params.tenantId,
        userId: params.userId,
        courseId: lesson.module.courseId,
        lessonId: params.lessonId,
        lastPositionSec: params.positionSec ?? 0,
        progressPercent: params.progressPercent ?? 0,
        completedAt: completedAt ?? null,
      },
      select: { lessonId: true, progressPercent: true, lastPositionSec: true, completedAt: true, updatedAt: true },
    });

    if (params.completed) {
      await this.prisma.analyticsEvent.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId,
          name: 'video.lesson_completed',
          properties: { lessonId: params.lessonId, courseId: lesson.module.courseId } as never,
        },
        select: { id: true },
      });
    }

    return progress;
  }

  private async hasCourseAccess(tenantId: string, userId: string, courseId: string) {
    const ent = await this.prisma.entitlement.findFirst({
      where: {
        tenantId,
        userId,
        revokedAt: null,
        OR: [
          { resourceType: 'TENANT', resourceId: tenantId },
          { resourceType: 'COURSE', resourceId: courseId },
        ],
      },
      select: { id: true },
    });
    return Boolean(ent);
  }
}
