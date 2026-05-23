import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { EmailService } from './email.service';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService, OutboxDispatcherService],
})
export class NotificationsModule {}
