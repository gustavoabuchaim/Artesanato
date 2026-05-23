import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class TrackProgressDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  positionSec?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

