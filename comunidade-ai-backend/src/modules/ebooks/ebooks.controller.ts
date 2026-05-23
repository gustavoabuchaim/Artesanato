import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { EbooksService } from './ebooks.service';

@ApiTags('ebooks')
@Controller('ebooks')
export class EbooksController {
  constructor(private readonly ebooks: EbooksService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return this.ebooks.listPublished(user.tenantId);
  }

  @Get('me')
  async my(@CurrentUser() user: AuthUser) {
    return this.ebooks.listMyLibrary(user.tenantId, user.userId);
  }

  @Get(':id/download')
  async download(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.ebooks.getDownloadUrl({
      tenantId: user.tenantId,
      userId: user.userId,
      ebookId: id,
      ip: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
    });
  }
}
