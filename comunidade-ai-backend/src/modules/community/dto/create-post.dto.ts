import { IsOptional, IsString, Length } from 'class-validator';

export class CreatePostDto {
  @IsString()
  @Length(1, 64)
  spaceId!: string;

  @IsString()
  @Length(3, 140)
  title!: string;

  @IsString()
  @Length(1, 20_000)
  body!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  attachmentFileId?: string;
}
