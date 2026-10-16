import { BlockReason } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsLocalDate } from '../common/validation';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PublicBookingDto {
  @IsUUID() serviceId: string;
  /** Omitir o null = cualquier profesional disponible. */
  @IsOptional() @IsUUID() staffId?: string | null;
  @IsDateString({ strict: true }) startsAt: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) customerName: string;
  @Transform(trim) @IsString() @MinLength(6) @MaxLength(32) customerPhone: string;
  /** País del selector (ISO 3166) usado si el número no incluye prefijo internacional. */
  @IsOptional() @IsString() @MaxLength(2) phoneCountry?: string;
  @IsOptional() @IsBoolean() whatsappConsent?: boolean;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string;
  /** Campo trampa anti-bots: debe llegar vacío. */
  @IsOptional() @IsString() @Equals('') website?: string;
}

export class RescheduleByTokenDto {
  @IsDateString({ strict: true }) startsAt: string;
}

export class CancelDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(300) reason?: string;
}

export class AvailabilityQueryDto {
  @IsUUID() serviceId: string;
  @IsOptional() @IsUUID() staffId?: string;
  @IsLocalDate() from: string;
  @IsOptional() @IsLocalDate() to?: string;
}

export class TokenAvailabilityQueryDto {
  @IsLocalDate() from: string;
  @IsOptional() @IsLocalDate() to?: string;
}

export class AgendaQueryDto {
  @IsDateString() from: string;
  @IsDateString() to: string;
  @IsOptional() @IsUUID() staffId?: string;
}

export class CreateWalkInDto {
  @IsUUID() staffId: string;
  @IsOptional() @IsUUID() serviceId?: string;
  /** Por defecto: ahora. */
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsInt() @Min(5) @Max(720) durationMinutes?: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string;
}

export class CreateBlockDto {
  @IsUUID() staffId: string;
  @IsDateString() startsAt: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsInt() @Min(5) @Max(1440) durationMinutes?: number;
  @IsEnum(BlockReason) reason: BlockReason;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(300) notes?: string;
}

export class AdminRescheduleDto {
  @IsDateString() startsAt: string;
  @IsOptional() @IsUUID() staffId?: string;
}
