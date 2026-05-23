import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class WaitlistDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;
}

