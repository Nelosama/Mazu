import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../auth/tenant.guard';
import { AuthUser, CurrentUser, Roles, Tenant, TenantContext } from '../common/request-context';
import { StaffService } from './staff.service';
import { CreateExceptionDto, CreateStaffDto, CreateTimeOffDto, UpdateStaffDto, WeeklyScheduleDto } from './dto';

@UseGuards(TenantGuard)
@Controller('businesses/:businessId/staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list(@Tenant() t: TenantContext) {
    return this.staff.list(t.businessId);
  }

  @Get(':id')
  get(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.staff.get(t.businessId, id);
  }

  @Roles('OWNER', 'ADMIN')
  @Post()
  create(@Tenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() dto: CreateStaffDto) {
    return this.staff.create(t, u.id, dto);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':id')
  update(@Tenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto) {
    return this.staff.update(t, u.id, id, dto);
  }

  @Get(':id/schedule')
  schedule(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.staff.getSchedule(t, id);
  }

  @Put(':id/schedule')
  replaceSchedule(@Tenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WeeklyScheduleDto) {
    return this.staff.replaceWeeklySchedule(t, u.id, id, dto);
  }

  @Post(':id/exceptions')
  addException(@Tenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateExceptionDto) {
    return this.staff.addException(t, u.id, id, dto);
  }

  @HttpCode(204)
  @Delete(':id/exceptions/:exceptionId')
  async removeException(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('exceptionId', ParseUUIDPipe) exId: string) {
    await this.staff.removeException(t, id, exId);
  }

  @Post(':id/time-off')
  addTimeOff(@Tenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateTimeOffDto) {
    return this.staff.addTimeOff(t, u.id, id, dto);
  }

  @HttpCode(204)
  @Delete(':id/time-off/:timeOffId')
  async removeTimeOff(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('timeOffId', ParseUUIDPipe) toId: string) {
    await this.staff.removeTimeOff(t, id, toId);
  }
}

@Module({ controllers: [StaffController], providers: [StaffService], exports: [StaffService] })
export class StaffModule {}
