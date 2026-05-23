import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class InviteGuestArtisanDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;
}

