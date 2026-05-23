import { IsOptional, IsString, Length } from 'class-validator';

export class ModerateDto {
  @IsString()
  @Length(2, 24)
  action!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  reason?: string;
}

