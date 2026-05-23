import { IsString, Length } from 'class-validator';

export class MarkReadDto {
  @IsString()
  @Length(1, 64)
  notificationId!: string;
}

