import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Throttle, minutes } from '@nestjs/throttler';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { TrackProgressDto } from './dto/track-progress.dto';
import { VideosService } from './videos.service';

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Get('lessons/:lessonId/playback')
  async playback(@CurrentUser() user: AuthUser, @Param('lessonId') lessonId: string) {
    return this.videos.getPlayback({ tenantId: user.tenantId, userId: user.userId, lessonId });
  }

  @Roles('ADMIN')
  @Throttle({ default: { limit: 30, ttl: minutes(1) } })
  @Post('lessons/:lessonId/panda/init-upload')
  async initPandaUpload(@CurrentUser() user: AuthUser, @Param('lessonId') lessonId: string, @Body() body: any) {
    const filename = typeof body?.filename === 'string' ? body.filename : '';
    const contentType = typeof body?.contentType === 'string' ? body.contentType : '';
    const sizeBytes = typeof body?.sizeBytes === 'number' ? body.sizeBytes : NaN;
    const folderId = typeof body?.folderId === 'string' ? body.folderId : undefined;

    return this.videos.initPandaTusUpload({
      tenantId: user.tenantId,
      lessonId,
      filename,
      contentType,
      sizeBytes,
      folderId,
    });
  }

  @Roles('ADMIN')
  @Throttle({ default: { limit: 60, ttl: minutes(1) } })
  @Post('lessons/:lessonId/panda/link')
  async linkPanda(@CurrentUser() user: AuthUser, @Param('lessonId') lessonId: string, @Body() body: any) {
    const pandaVideoId = typeof body?.pandaVideoId === 'string' ? body.pandaVideoId : '';
    const durationSec = typeof body?.durationSec === 'number' ? body.durationSec : undefined;
    const metadata = typeof body?.metadata === 'object' ? body.metadata : undefined;
    return this.videos.linkPandaVideo({ tenantId: user.tenantId, lessonId, pandaVideoId, durationSec, metadata });
  }

  @Throttle({ default: { limit: 120, ttl: minutes(1) } })
  @Post('lessons/:lessonId/watch-time')
  async watchTime(
    @CurrentUser() user: AuthUser,
    @Param('lessonId') lessonId: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    const secondsWatched = typeof body?.secondsWatched === 'number' ? body.secondsWatched : NaN;
    const positionSec = typeof body?.positionSec === 'number' ? body.positionSec : undefined;
    return this.videos.trackWatchTime({
      tenantId: user.tenantId,
      userId: user.userId,
      lessonId,
      secondsWatched,
      positionSec,
      ip: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
    });
  }

  @Post('lessons/:lessonId/progress')
  async progress(
    @CurrentUser() user: AuthUser,
    @Param('lessonId') lessonId: string,
    @Body() body: TrackProgressDto,
  ) {
    return this.videos.trackProgress({
      tenantId: user.tenantId,
      userId: user.userId,
      lessonId,
      positionSec: body.positionSec,
      progressPercent: body.progressPercent,
      completed: body.completed,
    });
  }
}
