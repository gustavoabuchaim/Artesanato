import { IsOptional, IsString, Length } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @Length(1, 10_000)
  body!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  parentCommentId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  attachmentFileId?: string;
}
