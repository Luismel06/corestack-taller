import { DocumentType, EmployeeStatus, Role } from '@qorvex/database';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsObject,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class EmployeePermissionsDto {
  @IsOptional()
  @IsObject()
  permissionOverrides?: Record<string, boolean>;

  @IsOptional()
  @IsBoolean()
  canUsePos?: boolean;

  @IsOptional()
  @IsBoolean()
  canOpenCashSession?: boolean;

  @IsOptional()
  @IsBoolean()
  canCloseCashSession?: boolean;

  @IsOptional()
  @IsBoolean()
  canApplyDiscount?: boolean;

  @IsOptional()
  @IsBoolean()
  canCancelInvoice?: boolean;

  @IsOptional()
  @IsBoolean()
  canVoidInvoice?: boolean;

  @IsOptional()
  @IsBoolean()
  canAdjustInventory?: boolean;

  @IsOptional()
  @IsBoolean()
  canManageProducts?: boolean;

  @IsOptional()
  @IsBoolean()
  canManageEmployees?: boolean;

  @IsOptional()
  @IsBoolean()
  canViewReports?: boolean;

  @IsOptional()
  @IsBoolean()
  canManageFiscalSequences?: boolean;

  @IsOptional()
  @IsBoolean()
  canViewCashLogs?: boolean;

  @IsOptional()
  @IsBoolean()
  canReprintReceipt?: boolean;

  @IsOptional()
  @IsBoolean()
  canTakeOrders?: boolean;
}

export class CreateEmployeeDto extends EmployeePermissionsDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsEnum(Role)
  role: Role;

  @IsOptional()
  @IsString()
  employeeCode?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}

export class UpdateEmployeeDto extends EmployeePermissionsDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  employeeCode?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}
