import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { ScheduleSessionDto } from './dto/schedule-session.dto';
import { MentorshipService } from './mentorship.service';

@ApiTags('mentorship')
@Controller('mentorship')
export class MentorshipController {
  constructor(private readonly mentorship: MentorshipService) {}

  @Get('offers')
  async offers(@CurrentUser() user: AuthUser) {
    return this.mentorship.listOffers(user.tenantId);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return this.mentorship.my(user.tenantId, user.userId);
  }

  @Post('schedule')
  async schedule(@CurrentUser() user: AuthUser, @Body() body: ScheduleSessionDto) {
    return this.mentorship.schedule({
      tenantId: user.tenantId,
      userId: user.userId,
      offerId: body.offerId,
      scheduledAt: new Date(body.scheduledAt),
      meetingUrl: body.meetingUrl,
    });
  }
}
