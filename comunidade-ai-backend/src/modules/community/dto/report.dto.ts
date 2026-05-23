import { IsOptional, IsString, Length } from 'class-validator';

export class ReportDto {
  @IsString()
  @Length(3, 64)
  reason!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  details?: string;
}

