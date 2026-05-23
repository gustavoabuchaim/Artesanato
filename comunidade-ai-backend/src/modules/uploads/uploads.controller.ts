import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { InitUploadDto } from './dto/init-upload.dto';
import { UploadsService } from './uploads.service';

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Throttle({ default: { limit: 30, ttl: minutes(1) } })
  @Post('init')
  async init(@CurrentUser() user: AuthUser, @Body() body: InitUploadDto) {
    return this.uploads.initUpload({
      tenantId: user.tenantId,
      userId: user.userId,
      purpose: body.purpose,
      filename: body.filename,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });
  }

  @Throttle({ default: { limit: 30, ttl: minutes(1) } })
  @Post('complete')
  async complete(@CurrentUser() user: AuthUser, @Body() body: CompleteUploadDto) {
    return this.uploads.completeUpload({
      tenantId: user.tenantId,
      userId: user.userId,
      uploadSessionId: body.uploadSessionId,
      checksum: body.checksum,
    });
  }

  @Throttle({ default: { limit: 120, ttl: minutes(1) } })
  @Get('signed-read')
  async signedRead(@CurrentUser() user: AuthUser, @Query('r2Key') r2Key: string) {
    const url = await this.uploads.getSignedReadUrl({ tenantId: user.tenantId, r2Key });
    return { url };
  }
}
