import { Module } from '@nestjs/common';
import { MentorshipController } from './mentorship.controller';
import { MentorshipService } from './mentorship.service';

@Module({
  controllers: [MentorshipController],
  providers: [MentorshipService]
})
export class MentorshipModule {}
