import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Prisma, Service } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { TenantGuard } from '../auth/tenant.guard';
import { AuthUser, CurrentUser, Roles, Tenant, TenantContext } from '../common/request-context';
import { badRequest, notFound } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import { publicFileUrl } from '../storage/public-url';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const asMoneyString = ({ value }: { value: unknown }) =>
  typeof value === 'number' ? String(value) : value;

export class CreateServiceDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(60) category?: string;
  // Importe como cadena decimal para no perder precisión ("250.00").
  @Transform(asMoneyString)
  @IsString()
  @Matches(MONEY, { message: 'price debe ser un importe decimal' })
  price: string;
  @IsInt() @Min(5) @Max(720) durationMinutes: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(10000) sortOrder?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('4', { each: true }) staffIds?: string[];
}

export class UpdateServiceDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(60) category?: string;
  @IsOptional() @Transform(asMoneyString) @IsString() @Matches(MONEY) price?: string;
  @IsOptional() @IsInt() @Min(5) @Max(720) durationMinutes?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(10000) sortOrder?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('4', { each: true }) staffIds?: string[];
}

export function serializeService(s: Service & { staff?: { staffId: string }[] }, currency: string) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    price: s.price.toFixed(2),
    currency,
    durationMinutes: s.durationMinutes,
    photoUrl: publicFileUrl(s.photoPath),
    active: s.active,
    sortOrder: s.sortOrder,
    ...(s.staff ? { staffIds: s.staff.map((x) => x.staffId) } : {}),
  };
}

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenant: TenantContext) {
    const items = await this.prisma.service.findMany({
      where: { businessId: tenant.businessId },
      include: { staff: { select: { staffId: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return items.map((s) => serializeService(s, tenant.currency));
  }

  async create(tenant: TenantContext, actorUserId: string, dto: CreateServiceDto) {
    const { staffIds, ...data } = dto;
    const service = await this.prisma.$transaction(async (tx) => {
      const created = await tx.service.create({
        data: { ...data, price: new Prisma.Decimal(data.price), businessId: tenant.businessId },
      });
      if (staffIds?.length) await this.assignStaff(tx, tenant.businessId, created.id, staffIds);
      return tx.service.findUniqueOrThrow({
        where: { id: created.id },
        include: { staff: { select: { staffId: true } } },
      });
    });
    await this.audit.log({
      actorUserId,
      businessId: tenant.businessId,
      action: 'service.create',
      targetType: 'Service',
      targetId: service.id,
    });
    return serializeService(service, tenant.currency);
  }

  async update(tenant: TenantContext, actorUserId: string, id: string, dto: UpdateServiceDto) {
    const existing = await this.prisma.service.findFirst({
      where: { id, businessId: tenant.businessId },
    });
    if (!existing) throw notFound('SERVICE_NOT_FOUND');
    const { staffIds, price, ...data } = dto;
    const service = await this.prisma.$transaction(async (tx) => {
      await tx.service.update({
        where: { id },
        data: { ...data, ...(price !== undefined ? { price: new Prisma.Decimal(price) } : {}) },
      });
      if (staffIds) {
        await tx.staffService.deleteMany({
          where: { businessId: tenant.businessId, serviceId: id },
        });
        await this.assignStaff(tx, tenant.businessId, id, staffIds);
      }
      return tx.service.findUniqueOrThrow({
        where: { id },
        include: { staff: { select: { staffId: true } } },
      });
    });
    await this.audit.log({
      actorUserId,
      businessId: tenant.businessId,
      action: 'service.update',
      targetType: 'Service',
      targetId: id,
    });
    return serializeService(service, tenant.currency);
  }

  private async assignStaff(
    tx: Prisma.TransactionClient,
    businessId: string,
    serviceId: string,
    staffIds: string[],
  ) {
    const unique = [...new Set(staffIds)];
    const found = await tx.staff.count({ where: { businessId, id: { in: unique } } });
    if (found !== unique.length) throw badRequest('STAFF_NOT_IN_BUSINESS');
    await tx.staffService.createMany({
      data: unique.map((staffId) => ({ businessId, staffId, serviceId })),
    });
  }
}

@UseGuards(TenantGuard)
@Controller('businesses/:businessId/services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  list(@Tenant() t: TenantContext) {
    return this.services.list(t);
  }

  @Roles('OWNER', 'ADMIN')
  @Post()
  create(@Tenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() dto: CreateServiceDto) {
    return this.services.create(t, u.id, dto);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':id')
  update(
    @Tenant() t: TenantContext,
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.services.update(t, u.id, id, dto);
  }
}

@Module({
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
