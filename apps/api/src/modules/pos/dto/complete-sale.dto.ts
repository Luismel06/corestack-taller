import { DocumentType, InvoiceDocumentType, PaymentMethod } from '@qorvex/database';
import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PosSaleItemDto {
  @IsString()
  productId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity: number;
}

export class CompleteSaleDto {
  @IsOptional()
  @IsUUID()
  checkoutKey?: string;

  @IsOptional()
  @IsBoolean()
  electronicInvoiceRequested?: boolean;

  @IsOptional()
  @IsEmail()
  ecfRecipientEmail?: string;
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsEnum(InvoiceDocumentType)
  documentType?: InvoiceDocumentType;

  @IsOptional()
  @IsIn([DocumentType.RNC, DocumentType.CEDULA])
  fiscalDocumentType?: 'RNC' | 'CEDULA';

  @IsOptional()
  @IsString()
  fiscalDocumentNumber?: string;

  @IsOptional()
  @IsIn([
    PaymentMethod.CASH,
    PaymentMethod.CARD,
    PaymentMethod.TRANSFER,
    PaymentMethod.CHECK,
    PaymentMethod.OTHER,
  ])
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PosSalePaymentDto)
  payments?: PosSalePaymentDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountReceived?: number;

  @IsOptional()
  @IsString()
  cashSessionId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosSaleItemDto)
  items?: PosSaleItemDto[];
}

export class PosSalePaymentDto {
  @IsIn([
    PaymentMethod.CASH,
    PaymentMethod.CARD,
    PaymentMethod.TRANSFER,
    PaymentMethod.CHECK,
    PaymentMethod.OTHER,
  ])
  method: PaymentMethod;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountReceived?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
