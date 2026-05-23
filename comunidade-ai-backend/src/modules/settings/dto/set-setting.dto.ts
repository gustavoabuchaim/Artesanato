import { IsDefined, IsString, Length } from 'class-validator';

export class SetSettingDto {
  @IsString()
  @Length(1, 64)
  key!: string;

  @IsDefined()
  value!: unknown;
}

