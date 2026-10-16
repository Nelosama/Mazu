import { FeedbackFollowUp, WouldReturn } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitFeedbackDto {
  @IsInt() @Min(1) @Max(5) rating: number;
  @IsEnum(WouldReturn) wouldReturn: WouldReturn;
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class FeedbackQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() staffId?: string;
  @IsOptional() @IsUUID() serviceId?: string;
}

export class FeedbackListQueryDto extends FeedbackQueryDto {
  @IsOptional() @IsEnum(FeedbackFollowUp) followUpStatus?: FeedbackFollowUp;
  @IsOptional() @IsIn(['all', 'negative', 'with_comment']) filter?:
    'all' | 'negative' | 'with_comment';
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class UpdateFollowUpDto {
  @IsEnum(FeedbackFollowUp) followUpStatus: FeedbackFollowUp;
  @IsOptional() @IsString() @MaxLength(500) followUpNote?: string;
}
