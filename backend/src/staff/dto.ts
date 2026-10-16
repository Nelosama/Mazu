import { TimeOffType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsLocalDate } from '../common/validation';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateStaffDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) specialty?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) bio?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) commissionPercent?: number;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('4', { each: true }) serviceIds?: string[];
  /** Si true, crea el horario por defecto lunes–sábado 09:00–18:00. */
  @IsOptional() @IsBoolean() withDefaultSchedule?: boolean;
}

export class UpdateStaffDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) specialty?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) bio?: string;
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  commissionPercent?: number | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(10000) sortOrder?: number;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('4', { each: true }) serviceIds?: string[];
}

export class TimeRangeDto {
  @IsInt() @Min(1) @Max(7) weekday: number;
  @IsInt() @Min(0) @Max(1440) startMinute: number;
  @IsInt() @Min(0) @Max(1440) endMinute: number;
  @IsOptional() @IsString() @MaxLength(60) label?: string;
}

export class WeeklyScheduleDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TimeRangeDto)
  workingHours: TimeRangeDto[];
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TimeRangeDto)
  breaks: TimeRangeDto[];
}

export class CreateExceptionDto {
  @IsLocalDate() date: string;
  @IsBoolean() isClosed: boolean;
  @ValidateIf((o) => !o.isClosed) @IsInt() @Min(0) @Max(1440) startMinute?: number;
  @ValidateIf((o) => !o.isClosed) @IsInt() @Min(0) @Max(1440) endMinute?: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class CreateTimeOffDto {
  @IsEnum(TimeOffType) type: TimeOffType;
  /** Fechas locales inclusivas (en la zona horaria de la sucursal) o instantes ISO. */
  @ValidateIf((o) => !o.startsAt) @IsLocalDate() fromDate?: string;
  @ValidateIf((o) => !o.startsAt) @IsLocalDate() toDate?: string;
  @ValidateIf((o) => !o.fromDate) @IsDateString() startsAt?: string;
  @ValidateIf((o) => !o.fromDate) @IsDateString() endsAt?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}
