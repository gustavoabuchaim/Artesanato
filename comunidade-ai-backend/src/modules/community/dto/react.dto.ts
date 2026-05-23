import { IsString, Length } from 'class-validator';

export class ReactDto {
  @IsString()
  @Length(2, 16)
  kind!: string;
}
