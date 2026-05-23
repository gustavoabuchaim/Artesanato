import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateOnboardingDto {
  @IsInt()
  @Min(0)
  step!: number;

  @IsOptional()
  data?: unknown;
}

