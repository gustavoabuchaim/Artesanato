import { IsOptional, IsString, Length } from 'class-validator';

export class TrackEventDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsOptional()
  properties?: unknown;

  @IsOptional()
  @IsString()
  @Length(1, 512)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 512)
  referrer?: string;
}

