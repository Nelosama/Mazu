import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TenantGuard } from '../auth/tenant.guard';
import { AuthUser, CurrentUser, Tenant, TenantContext } from '../common/request-context';
import { AppointmentsService, toDayList } from './appointments.service';
import {
  AdminRescheduleDto,
  AgendaQueryDto,
  AvailabilityQueryDto,
  CancelDto,
  CreateBlockDto,
  CreateWalkInDto,
} from './dto';
import { AvailabilityService } from '../availability/availability.service';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(TenantGuard)
@Controller('businesses/:businessId/appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  agenda(@Tenant() t: TenantContext, @Query() q: AgendaQueryDto) {
    return this.appointments.agenda(t, q);
  }

  @Post('walk-ins')
  walkIn(@Tenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() dto: CreateWalkInDto) {
    return this.appointments.createWalkIn(t, u.id, dto);
  }

  @Post('blocks')
  block(@Tenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() dto: CreateBlockDto) {
    return this.appointments.createBlock(t, u.id, dto);
  }

  @HttpCode(200)
  @Post(':id/cancel')
  cancel(
    @Tenant() t: TenantContext,
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelDto,
  ) {
    return this.appointments.cancel(t, u.id, id, dto.reason);
  }

  @HttpCode(200)
  @Post(':id/complete')
  complete(
    @Tenant() t: TenantContext,
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.appointments.complete(t, u.id, id);
  }

  @HttpCode(200)
  @Post(':id/no-show')
  noShow(
    @Tenant() t: TenantContext,
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.appointments.noShow(t, u.id, id);
  }

  @HttpCode(200)
  @Post(':id/reschedule')
  reschedule(
    @Tenant() t: TenantContext,
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminRescheduleDto,
  ) {
    return this.appointments.adminReschedule(t, u.id, id, dto);
  }

  @HttpCode(200)
  @Post(':id/feedback-link')
  feedbackLink(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.regenerateFeedbackLink(t, id);
  }
}

/** Disponibilidad vista desde el panel (sin antelación mínima). */
@UseGuards(TenantGuard)
@Controller('businesses/:businessId/availability')
export class AdminAvailabilityController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async get(@Tenant() t: TenantContext, @Query() q: AvailabilityQueryDto) {
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: t.businessId } });
    const map = await this.availability.slots(business, {
      ...q,
      to: q.to ?? q.from,
      ignoreLeadTime: true,
    });
    return toDayList(map);
  }
}

@Module({
  controllers: [AppointmentsController, AdminAvailabilityController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
