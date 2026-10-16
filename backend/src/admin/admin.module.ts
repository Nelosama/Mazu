import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { AppRequest, AuthUser, CurrentUser, Roles, Tenant, TenantContext, clientIp } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { notFound } from '../common/errors';
import { AdminService } from './admin.service';
import { RetentionJob } from './retention.job';
import { AdminBusinessStatusDto, AdminCreateBusinessDto, AdminSubscriptionDto, PlanDto, SupportAccessDto, SupportGrantDto } from './dto';
import { AuthModule } from '../auth/auth.module';
import { BusinessesModule } from '../businesses/businesses.module';

@UseGuards(PlatformAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('metrics')
  metrics() {
    return this.admin.metrics();
  }

  @Get('businesses')
  businesses(@Query('q') q?: string, @Query('status') status?: string) {
    return this.admin.listBusinesses(typeof q === 'string' ? q.slice(0, 80) : undefined, status);
  }

  @Post('businesses')
  create(@CurrentUser() u: AuthUser, @Body() dto: AdminCreateBusinessDto, @Req() req: AppRequest) {
    return this.admin.createBusiness(u.id, dto, clientIp(req));
  }

  @Patch('businesses/:id/status')
  status(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminBusinessStatusDto, @Req() req: AppRequest) {
    return this.admin.setStatus(u.id, id, dto, clientIp(req));
  }

  @Patch('businesses/:id/subscription')
  subscription(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminSubscriptionDto, @Req() req: AppRequest) {
    return this.admin.setSubscription(u.id, id, dto, clientIp(req));
  }

  @HttpCode(200)
  @Post('businesses/:id/support/appointments')
  support(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SupportAccessDto, @Req() req: AppRequest) {
    return this.admin.supportAppointments(u.id, id, dto, clientIp(req));
  }

  @Get('plans')
  plans() {
    return this.admin.listPlans();
  }

  @Post('plans')
  createPlan(@CurrentUser() u: AuthUser, @Body() dto: PlanDto) {
    return this.admin.createPlan(u.id, dto);
  }

  @Patch('plans/:id')
  updatePlan(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PlanDto) {
    return this.admin.updatePlan(u.id, id, dto);
  }

  @Get('incidents')
  incidents(@Query('all') all?: string) {
    return this.admin.incidents(all === 'true');
  }

  @Patch('incidents/:id/resolve')
  resolve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.resolveIncident(u.id, id);
  }

  @Get('audit')
  audit(@Query('businessId', new ParseUUIDPipe({ optional: true })) businessId?: string) {
    return this.admin.auditLog(businessId);
  }
}

/** Autorizaciones de soporte concedidas por el OWNER del negocio. */
@UseGuards(TenantGuard)
@Roles('OWNER')
@Controller('businesses/:businessId/support-grants')
export class SupportGrantsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Tenant() t: TenantContext) {
    return this.prisma.supportAccessGrant.findMany({ where: { businessId: t.businessId }, orderBy: { createdAt: 'desc' }, take: 20 });
  }

  @Post()
  async create(@Tenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() dto: SupportGrantDto) {
    const grant = await this.prisma.supportAccessGrant.create({
      data: { businessId: t.businessId, grantedById: u.id, reason: dto.reason, expiresAt: new Date(Date.now() + dto.hours * 3_600_000) },
    });
    await this.audit.log({ actorUserId: u.id, businessId: t.businessId, action: 'support_grant.create', targetType: 'SupportAccessGrant', targetId: grant.id });
    return grant;
  }

  @HttpCode(204)
  @Delete(':id')
  async revoke(@Tenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const res = await this.prisma.supportAccessGrant.updateMany({
      where: { id, businessId: t.businessId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!res.count) throw notFound();
    await this.audit.log({ actorUserId: u.id, businessId: t.businessId, action: 'support_grant.revoke', targetType: 'SupportAccessGrant', targetId: id });
  }
}

@Module({
  imports: [AuthModule, BusinessesModule],
  controllers: [AdminController, SupportGrantsController],
  providers: [AdminService, RetentionJob],
})
export class AdminModule {}
