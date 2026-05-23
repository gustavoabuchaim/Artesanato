import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CreateCheckoutDto {
  @IsString()
  @Length(1, 64)
  priceId!: string;

  @IsOptional()
  @IsString()
  @IsIn(['STRIPE', 'MERCADOPAGO', 'HOTMART'])
  provider?: string;
}
