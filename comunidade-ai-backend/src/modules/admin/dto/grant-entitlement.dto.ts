import { IsOptional, IsString, Length } from 'class-validator';

export class GrantEntitlementDto {
  @IsString()
  @Length(1, 64)
  userId!: string;

  @IsString()
  @Length(2, 32)
  resourceType!: string;

  @IsString()
  @Length(1, 64)
  resourceId!: string;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  sourceRef?: string;
}

