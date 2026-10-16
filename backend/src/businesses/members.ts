import { MembershipRole, RecordStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class AddMemberDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)) @IsEmail() email: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  /** Contraseña inicial si el usuario no existe todavía (el miembro debe cambiarla). */
  @IsOptional() @IsString() @MinLength(10) @MaxLength(128) password?: string;
  @IsEnum(MembershipRole) role: MembershipRole;
  @IsOptional() @IsUUID() staffId?: string;
}

export class UpdateMemberDto {
  @IsOptional() @IsEnum(MembershipRole) role?: MembershipRole;
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() staffId?: string | null;
}
