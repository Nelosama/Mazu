import { BusinessStatus, SubscriptionStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CreateBusinessDto } from '../businesses/dto';
import { IsCurrencyCode } from '../common/validation';

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;

export class AdminOwnerDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)) @IsEmail() email: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(128) password?: string;
}

export class AdminCreateBusinessDto {
  @ValidateNested() @Type(() => AdminOwnerDto) owner: AdminOwnerDto;
  @ValidateNested() @Type(() => CreateBusinessDto) business: CreateBusinessDto;
  @IsOptional() @IsString() @MaxLength(30) planCode?: string;
}

export class AdminBusinessStatusDto {
  @IsEnum(BusinessStatus) status: BusinessStatus;
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

export class AdminSubscriptionDto {
  @IsString() @MaxLength(30) planCode: string;
  @IsOptional() @IsEnum(SubscriptionStatus) status?: SubscriptionStatus;
}

export class PlanDto {
  @IsOptional() @IsString() @Matches(/^[A-Z0-9_]{2,30}$/) code?: string;
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @Transform(({ value }) => (typeof value === 'number' ? String(value) : value)) @Matches(MONEY) monthlyPrice?: string;
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value)) @IsCurrencyCode() currency?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(10000) maxStaff?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(1000) maxBranches?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(1_000_000) maxMonthlyBookings?: number | null;
  @IsOptional() @IsBoolean() customBranding?: boolean;
  @IsOptional() @IsBoolean() satisfactionReports?: boolean;
  @IsOptional() @IsBoolean() advancedReports?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class SupportGrantDto {
  @IsString() @MinLength(5) @MaxLength(500) reason: string;
  @IsInt() @Min(1) @Max(72) hours: number;
}

export class SupportAccessDto {
  @IsString() @MinLength(5) @MaxLength(500) reason: string;
}
