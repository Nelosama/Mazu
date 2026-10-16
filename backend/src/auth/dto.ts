import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateBusinessDto } from '../businesses/dto';
import { SUPPORTED_LOCALES } from '../common/validation';

const normEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @Transform(normEmail) @IsEmail() @MaxLength(254) email: string;

  // Longitud mínima en lugar de reglas de composición (recomendación NIST 800-63B).
  @IsString() @MinLength(10) @MaxLength(128) password: string;

  @IsOptional() @IsIn(SUPPORTED_LOCALES) preferredLocale?: string;

  @ValidateNested() @Type(() => CreateBusinessDto) business: CreateBusinessDto;
}

export class LoginDto {
  @Transform(normEmail) @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(1) @MaxLength(128) password: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(128) currentPassword: string;
  @IsString() @MinLength(10) @MaxLength(128) newPassword: string;
}
