import { IsDateString, IsOptional, IsString, Length } from 'class-validator';

export class ScheduleSessionDto {
  @IsString()
  @Length(1, 64)
  offerId!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1024)
  meetingUrl?: string;
}

