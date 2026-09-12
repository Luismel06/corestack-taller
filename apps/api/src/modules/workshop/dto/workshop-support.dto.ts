import { IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class WorkshopMoneyDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999.99) amount!: number;
  @IsIn(['CASH', 'CARD', 'TRANSFER', 'CHECK', 'OTHER']) method!: 'CASH' | 'CARD' | 'TRANSFER' | 'CHECK' | 'OTHER';
  @IsString() @MinLength(1) cashSessionId!: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
}
export class CreateAdvanceDto extends WorkshopMoneyDto {
  @IsString() @MinLength(1) ticketId!: string;
  @IsUUID() requestKey!: string;
}
export class RefundAdvanceDto {
  @IsString() @MinLength(1) cashSessionId!: string;
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}
export class CreateExpenseDto {
  @IsUUID() requestKey!: string;
  @IsOptional() @IsString() ticketId?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsIn(['RENT', 'UTILITIES', 'PAYROLL', 'TOOLS', 'FUEL', 'EXTERNAL_SERVICE', 'MAINTENANCE', 'OTHER']) category!: string;
  @IsString() @MinLength(3) @MaxLength(500) description!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999.99) amount!: number;
  @IsISO8601() incurredAt!: string;
  @IsOptional() @IsISO8601() dueAt?: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
}
export class ExpenseActionDto {
  @IsIn(['PAY', 'VOID']) action!: 'PAY' | 'VOID';
  @IsOptional() @IsString() cashSessionId?: string;
  @IsOptional() @IsIn(['CASH', 'CARD', 'TRANSFER', 'CHECK', 'OTHER']) method?: 'CASH' | 'CARD' | 'TRANSFER' | 'CHECK' | 'OTHER';
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
export class CreateExternalJobDto {
  @IsUUID() requestKey!: string;
  @IsString() @MinLength(1) ticketId!: string;
  @IsString() @MinLength(1) ticketLineId!: string;
  @IsString() @MinLength(1) supplierId!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999.99) cost!: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class ExternalJobActionDto {
  @IsIn(['RETURN', 'CANCEL']) action!: 'RETURN' | 'CANCEL';
  @IsString() @MinLength(3) @MaxLength(1000) notes!: string;
}
export class CreateWarrantyDto {
  @IsString() @MinLength(1) ticketId!: string;
  @IsString() @MinLength(1) ticketLineId!: string;
  @IsISO8601() startsAt!: string;
  @IsOptional() @IsISO8601() expiresAt?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000000) mileageLimit?: number;
  @IsString() @MinLength(3) @MaxLength(2000) conditions!: string;
}
export class CreateWarrantyClaimDto {
  @IsString() @MinLength(3) @MaxLength(2000) complaint!: string;
  @IsInt() @Min(0) @Max(10000000) mileage!: number;
}
export class ResolveWarrantyClaimDto {
  @IsIn(['ACCEPTED', 'REJECTED', 'COMPLETED']) status!: 'ACCEPTED' | 'REJECTED' | 'COMPLETED';
  @IsString() @MinLength(5) @MaxLength(2000) resolution!: string;
  @IsOptional() @IsString() repairTicketId?: string;
}
export class CreateMaintenanceDto {
  @IsString() @MinLength(1) vehicleId!: string;
  @IsOptional() @IsString() originTicketId?: string;
  @IsString() @MinLength(3) @MaxLength(180) title!: string;
  @IsOptional() @IsISO8601() dueAt?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000000) dueMileage?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class MaintenanceActionDto {
  @IsIn(['COMPLETE', 'CANCEL']) action!: 'COMPLETE' | 'CANCEL';
  @IsOptional() @IsString() completedTicketId?: string;
  @IsString() @MinLength(3) @MaxLength(2000) notes!: string;
}
