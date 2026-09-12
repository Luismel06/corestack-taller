import { Type } from 'class-transformer';
import { IsNumber, IsString, Min } from 'class-validator';

export class OpenCashSessionDto {
  @IsString()
  cashRegisterId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'El monto inicial no puede ser negativo.' })
  openingAmount: number;
}
