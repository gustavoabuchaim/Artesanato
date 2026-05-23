import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class InitUploadDto {
  @IsString()
  @Length(1, 64)
  purpose!: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  filename?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  mimeType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sizeBytes?: number;
}

