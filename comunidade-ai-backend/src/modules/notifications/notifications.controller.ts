import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { MarkReadDto } from './dto/mark-read.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.tenantId, user.userId);
  }

  @Post('read')
  async read(@CurrentUser() user: AuthUser, @Body() body: MarkReadDto) {
    return this.notifications.markRead(user.tenantId, user.userId, body.notificationId);
  }
}
