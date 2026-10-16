import { BusinessStatus, BusinessType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  HEX_COLOR,
  IsCountryCode,
  IsCurrencyCode,
  IsTimezone,
  SLUG,
  SUPPORTED_LOCALES,
} from '../common/validation';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateBusinessDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsEnum(BusinessType) type: BusinessType;
  @Transform(upper) @IsCountryCode() country: string;
  @Transform(upper) @IsCurrencyCode() currency: string;
  @IsTimezone() timezone: string;
  @IsIn(SUPPORTED_LOCALES) locale: string;
  @IsOptional() @Transform(trim) @IsString() @Matches(SLUG) @MinLength(3) @MaxLength(60) slug?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
}

export class UpdateBusinessDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsEnum(BusinessType) type?: BusinessType;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @Matches(HEX_COLOR) primaryColor?: string;
  @IsOptional() @Transform(upper) @IsCountryCode() country?: string;
  @IsOptional() @Transform(upper) @IsCurrencyCode() currency?: string;
  @IsOptional() @IsTimezone() timezone?: string;
  @IsOptional() @IsIn(SUPPORTED_LOCALES) locale?: string;
  @IsOptional() @Transform(trim) @IsString() @Matches(SLUG) @MinLength(3) @MaxLength(60) slug?: string;
  @IsOptional() @IsInt() @IsIn([5, 10, 15, 20, 30, 45, 60]) slotIntervalMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10080) minLeadMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(365) maxAdvanceDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10080) cancelWindowMinutes?: number;
  @IsOptional() @IsBoolean() feedbackEnabled?: boolean;
}

export class SetBusinessStatusDto {
  @IsEnum(BusinessStatus) status: BusinessStatus;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
