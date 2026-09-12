import {
  WorkshopApprovalStatus,
  WorkshopAppointmentStatus,
  WorkshopQualityStatus,
  WorkshopInspectionResult,
  WorkshopTicketLineType,
  WorkshopTicketPriority,
  WorkshopTicketStatus,
  WorkshopTaskStatus,
  WorkshopBayStatus,
  WorkshopChangeOrderStatus,
  WorkshopVehicleType,
} from '@qorvex/database';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export class WorkshopPartMovementDto {
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01)
  @Max(9999999999.99)
  quantity: number;

  @IsUUID()
  operationKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateWorkshopVehicleDto {
  @IsString()
  customerId: string;

  @IsOptional()
  @IsEnum(WorkshopVehicleType)
  vehicleType?: WorkshopVehicleType;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  licensePlate?: string;

  @IsString()
  @MaxLength(80)
  make: string;

  @IsString()
  @MaxLength(100)
  model: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  year?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vin?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  mileage?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateWorkshopVehicleDto extends PartialType(CreateWorkshopVehicleDto) {}

export class CreateWorkshopAppointmentDto {
  @IsString()
  customerId: string;

  @IsString()
  vehicleId: string;

  @IsOptional()
  @IsString()
  mechanicId?: string;

  @IsDateString()
  startsAt: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  estimatedMinutes?: number;

  @IsString()
  @MaxLength(2000)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class UpdateWorkshopAppointmentDto extends PartialType(CreateWorkshopAppointmentDto) {
  @IsOptional()
  @IsEnum(WorkshopAppointmentStatus)
  status?: WorkshopAppointmentStatus;
}

export class CreateWorkshopReceptionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  mileage: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  fuelLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  accessories?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  belongings?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  exteriorCondition?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  interiorCondition?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  warningLights?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observations?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bay?: string;

  @IsOptional()
  @IsString()
  bayId?: string;

  @IsOptional()
  @IsString()
  initialMechanicId?: string;
}

export class UpdateWorkshopReceptionDto extends PartialType(CreateWorkshopReceptionDto) {}

export class CreateWorkshopBayDto {
  @IsString()
  @MaxLength(30)
  code: string;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateWorkshopBayDto extends PartialType(CreateWorkshopBayDto) {
  @IsOptional()
  @IsEnum(WorkshopBayStatus)
  status?: WorkshopBayStatus;
}

export class SaveWorkshopQualityCheckDto {
  @IsEnum(WorkshopQualityStatus)
  status: WorkshopQualityStatus;

  @IsBoolean()
  workCompleted: boolean;

  @IsBoolean()
  partsVerified: boolean;

  @IsBoolean()
  leaksChecked: boolean;

  @IsBoolean()
  fluidsChecked: boolean;

  @IsBoolean()
  warningLightsChecked: boolean;

  @IsBoolean()
  roadTested: boolean;

  @IsBoolean()
  toolsRemoved: boolean;

  @IsBoolean()
  vehicleCleaned: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observations?: string;
}

export class CreateWorkshopDeliveryDto {
  @IsString()
  @MaxLength(240)
  recipientName: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  mileageOut: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  recommendations?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class WorkshopInspectionItemDto {
  @IsString()
  @MaxLength(80)
  code: string;

  @IsString()
  @MaxLength(160)
  label: string;

  @IsEnum(WorkshopInspectionResult)
  result: WorkshopInspectionResult;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  recommendation?: string;
}

export class SaveWorkshopInspectionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkshopInspectionItemDto)
  items: WorkshopInspectionItemDto[];
}

export class WorkshopTicketLineDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsEnum(WorkshopTicketLineType)
  type: WorkshopTicketLineType;

  @IsString()
  @MaxLength(240)
  description: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;
}

export class CreateWorkshopServiceDto {
  @IsString()
  @MaxLength(40)
  code: string;

  @IsString()
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultPrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateWorkshopServiceDto extends PartialType(CreateWorkshopServiceDto) {}

export class CreateWorkshopTicketDto {
  @IsString()
  customerId: string;

  @IsString()
  vehicleId: string;

  @IsString()
  @MaxLength(2000)
  complaint: string;

  @IsOptional()
  @IsEnum(WorkshopTicketPriority)
  priority?: WorkshopTicketPriority;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  diagnosis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  internalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customerNotes?: string;

  @IsOptional()
  @IsDateString()
  promisedAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedTotal?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  mechanicIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkshopTicketLineDto)
  lines?: WorkshopTicketLineDto[];
}

export class UpdateWorkshopTicketDto {
  @IsOptional()
  @IsEnum(WorkshopTicketStatus)
  status?: WorkshopTicketStatus;

  @IsOptional()
  @IsEnum(WorkshopTicketPriority)
  priority?: WorkshopTicketPriority;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  complaint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  diagnosis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  internalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customerNotes?: string;

  @IsOptional()
  @IsDateString()
  promisedAt?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedTotal?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  mechanicIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkshopTicketLineDto)
  lines?: WorkshopTicketLineDto[];
}

export class WorkshopAuthorizationEvidenceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  authorizedByName: string;

  @IsIn(['IN_PERSON', 'PHONE', 'WHATSAPP', 'EMAIL', 'DIGITAL'])
  method: 'IN_PERSON' | 'PHONE' | 'WHATSAPP' | 'EMAIL' | 'DIGITAL';
}

export class RespondWorkshopApprovalDto extends WorkshopAuthorizationEvidenceDto {
  @IsString()
  @IsNotEmpty()
  quoteVersionId: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  approvedLineIds?: string[];

  @IsEnum(WorkshopApprovalStatus)
  status: WorkshopApprovalStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CreateWorkshopChangeOrderDto {
  @IsString()
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkshopTicketLineDto)
  lines: WorkshopTicketLineDto[];
}

export class RespondWorkshopChangeOrderDto extends WorkshopAuthorizationEvidenceDto {
  @IsEnum(WorkshopChangeOrderStatus)
  status: WorkshopChangeOrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CreateWorkshopTaskDto {
  @IsIn(['DIAGNOSIS', 'REPAIR'])
  kind: 'DIAGNOSIS' | 'REPAIR';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ticketLineId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  employeeId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedMinutes?: number;
}

export class UpdateWorkshopTaskDto extends PartialType(CreateWorkshopTaskDto) {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cancellationReason?: string;

  @IsOptional()
  @IsEnum(WorkshopTaskStatus)
  status?: WorkshopTaskStatus;
}

export class SendWorkshopTicketToCashierDto {
  @IsOptional()
  @IsBoolean()
  electronicInvoiceRequested?: boolean;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  ecfRecipientEmail?: string;
}
