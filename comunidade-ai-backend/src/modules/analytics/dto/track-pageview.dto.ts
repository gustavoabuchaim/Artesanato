import { IsOptional, IsString, Length } from 'class-validator';

export class TrackPageViewDto {
  @IsString()
  @Length(1, 1024)
  path!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 512)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 512)
  referrer?: string;
}

