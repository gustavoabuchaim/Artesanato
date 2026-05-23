import { IsOptional, IsString, Length } from 'class-validator';

export class CompleteUploadDto {
  @IsString()
  @Length(1, 64)
  uploadSessionId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  checksum?: string;
}

