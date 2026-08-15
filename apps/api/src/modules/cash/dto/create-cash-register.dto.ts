import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCashRegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;
}
