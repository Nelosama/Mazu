import { Body, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { RecordStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { TenantGuard } from '../auth/tenant.guard';
import { AuthUser, CurrentUser, Roles, Tenant, TenantContext } from '../common/request-context';
import { IsTimezone } from '../common/validation';
import { notFound } from '../common/errors';
import { PlansService } from '../subscriptions/plans.service';
import { AuditService } from '../audit/audit.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateBranchDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsTimezone() timezone?: string;
}

export class UpdateBranchDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsTimezone() timezone?: string;
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
}

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly audit: AuditService,
  ) {}

  list(businessId: string) {
    return this.prisma.branch.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } });
  }

  async create(tenant: TenantContext, actorUserId: string, dto: CreateBranchDto) {
    await this.plans.assertCanAddBranch(tenant.businessId);
    const branch = await this.prisma.branch.create({
      data: { businessId: tenant.businessId, name: dto.name, address: dto.address, timezone: dto.timezone ?? tenant.timezone },
    });
    await this.audit.log({ actorUserId, businessId: tenant.businessId, action: 'branch.create', targetType: 'Branch', targetId: branch.id });
    return branch;
  }

  async update(tenant: TenantContext, actorUserId: string, id: string, dto: UpdateBranchDto) {
    const existing = await this.prisma.branch.findFirst({ where: { id, businessId: tenant.businessId } });
    if (!existing) throw notFound('BRANCH_NOT_FOUND');
    if (dto.status === 'ACTIVE' && existing.status !== 'ACTIVE') await this.plans.assertCanAddBranch(tenant.businessId);
    const branch = await this.prisma.branch.update({ where: { id }, data: dto });
    await this.audit.log({ actorUserId, businessId: tenant.businessId, action: 'branch.update', targetType: 'Branch', targetId: id });
    return branch;
  }
}

@UseGuards(TenantGuard)
@Controller('businesses/:businessId/branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  list(@Tenant() t: TenantContext) {
    return this.branches.list(t.businessId);
  }

  @Roles('OWNER', 'ADMIN')
  @Post()
  create(@Tenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() dto: CreateBranchDto) {
    return this.branches.create(t, u.id, dto);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':id')
  update(
    @Tenant() t: TenantContext,
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branches.update(t, u.id, id, dto);
  }
}

@Module({ controllers: [BranchesController], providers: [BranchesService], exports: [BranchesService] })
export class BranchesModule {}
