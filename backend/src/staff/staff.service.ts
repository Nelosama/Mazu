import { Injectable } from '@nestjs/common';
import { Prisma, Staff } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import { PlansService } from '../subscriptions/plans.service';
import type { TenantContext } from '../common/request-context';
import { publicFileUrl } from '../storage/public-url';
import {
  CreateExceptionDto,
  CreateStaffDto,
  CreateTimeOffDto,
  TimeRangeDto,
  UpdateStaffDto,
  WeeklyScheduleDto,
} from './dto';

export function serializeStaff(s: Staff & { services?: { serviceId: string }[] }) {
  return {
    id: s.id,
    branchId: s.branchId,
    name: s.name,
    specialty: s.specialty,
    bio: s.bio,
    photoUrl: publicFileUrl(s.photoPath),
    commissionPercent: s.commissionPercent?.toFixed(2) ?? null,
    active: s.active,
    sortOrder: s.sortOrder,
    ...(s.services ? { serviceIds: s.services.map((x) => x.serviceId) } : {}),
  };
}

/** Comprueba que los tramos de un mismo día no se solapan. */
export function assertNoOverlap(ranges: TimeRangeDto[], code: string) {
  for (const r of ranges) {
    if (r.endMinute <= r.startMinute) throw badRequest(code, 'El fin debe ser posterior al inicio');
  }
  const byDay = new Map<number, TimeRangeDto[]>();
  ranges.forEach((r) => byDay.set(r.weekday, [...(byDay.get(r.weekday) ?? []), r]));
  for (const list of byDay.values()) {
    const sorted = [...list].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startMinute < sorted[i - 1].endMinute)
        throw badRequest(code, 'Tramos solapados');
    }
  }
}

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlansService,
  ) {}

  async list(businessId: string) {
    const items = await this.prisma.staff.findMany({
      where: { businessId },
      include: { services: { select: { serviceId: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return items.map(serializeStaff);
  }

  async get(businessId: string, id: string) {
    const s = await this.prisma.staff.findFirst({
      where: { id, businessId },
      include: { services: { select: { serviceId: true } } },
    });
    if (!s) throw notFound('STAFF_NOT_FOUND');
    return serializeStaff(s);
  }

  async create(tenant: TenantContext, actorUserId: string, dto: CreateStaffDto) {
    const businessId = tenant.businessId;
    const staff = await this.prisma.$transaction(async (tx) => {
      await this.plans.assertCanAddStaff(businessId, tx);
      const branchId = await this.resolveBranch(tx, businessId, dto.branchId);
      const created = await tx.staff.create({
        data: {
          businessId,
          branchId,
          name: dto.name,
          specialty: dto.specialty,
          bio: dto.bio,
          commissionPercent:
            dto.commissionPercent !== undefined ? new Prisma.Decimal(dto.commissionPercent) : null,
        },
      });
      if (dto.serviceIds?.length)
        await this.assignServices(tx, businessId, created.id, dto.serviceIds);
      if (dto.withDefaultSchedule) {
        await tx.workingHours.createMany({
          data: [1, 2, 3, 4, 5, 6].map((weekday) => ({
            businessId,
            staffId: created.id,
            weekday,
            startMinute: 9 * 60,
            endMinute: 18 * 60,
          })),
        });
      }
      return tx.staff.findUniqueOrThrow({
        where: { id: created.id },
        include: { services: { select: { serviceId: true } } },
      });
    });
    await this.audit.log({
      actorUserId,
      businessId,
      action: 'staff.create',
      targetType: 'Staff',
      targetId: staff.id,
    });
    return serializeStaff(staff);
  }

  async update(tenant: TenantContext, actorUserId: string, id: string, dto: UpdateStaffDto) {
    const businessId = tenant.businessId;
    const existing = await this.prisma.staff.findFirst({ where: { id, businessId } });
    if (!existing) throw notFound('STAFF_NOT_FOUND');
    const { serviceIds, commissionPercent, branchId, ...data } = dto;
    const staff = await this.prisma.$transaction(async (tx) => {
      if (dto.active === true && !existing.active)
        await this.plans.assertCanAddStaff(businessId, tx);
      await tx.staff.update({
        where: { id },
        data: {
          ...data,
          ...(branchId ? { branchId: await this.resolveBranch(tx, businessId, branchId) } : {}),
          ...(commissionPercent !== undefined
            ? {
                commissionPercent:
                  commissionPercent === null ? null : new Prisma.Decimal(commissionPercent),
              }
            : {}),
        },
      });
      if (serviceIds) {
        await tx.staffService.deleteMany({ where: { businessId, staffId: id } });
        await this.assignServices(tx, businessId, id, serviceIds);
      }
      return tx.staff.findUniqueOrThrow({
        where: { id },
        include: { services: { select: { serviceId: true } } },
      });
    });
    await this.audit.log({
      actorUserId,
      businessId,
      action: 'staff.update',
      targetType: 'Staff',
      targetId: id,
    });
    return serializeStaff(staff);
  }

  // ───────────── Horarios ─────────────

  private async assertStaffAccess(tenant: TenantContext, staffId: string, write: boolean) {
    const s = await this.prisma.staff.findFirst({
      where: { id: staffId, businessId: tenant.businessId },
    });
    if (!s) throw notFound('STAFF_NOT_FOUND');
    if (write && tenant.role === 'STAFF' && tenant.staffId !== staffId)
      throw forbidden('INSUFFICIENT_ROLE');
    return s;
  }

  async getSchedule(tenant: TenantContext, staffId: string) {
    await this.assertStaffAccess(tenant, staffId, false);
    const now = new Date();
    const [workingHours, breaks, exceptions, timeOff] = await Promise.all([
      this.prisma.workingHours.findMany({
        where: { staffId },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      }),
      this.prisma.recurringBreak.findMany({
        where: { staffId },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      }),
      this.prisma.scheduleException.findMany({
        where: {
          staffId,
          date: { gte: DateTime.utc().minus({ days: 1 }).startOf('day').toJSDate() },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.staffTimeOff.findMany({
        where: { staffId, endsAt: { gte: now } },
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    return {
      workingHours: workingHours.map(({ weekday, startMinute, endMinute }) => ({
        weekday,
        startMinute,
        endMinute,
      })),
      breaks: breaks.map(({ weekday, startMinute, endMinute, label }) => ({
        weekday,
        startMinute,
        endMinute,
        label,
      })),
      exceptions: exceptions.map((e) => ({
        ...e,
        date: DateTime.fromJSDate(e.date, { zone: 'utc' }).toISODate(),
      })),
      timeOff,
    };
  }

  async replaceWeeklySchedule(
    tenant: TenantContext,
    actorUserId: string,
    staffId: string,
    dto: WeeklyScheduleDto,
  ) {
    await this.assertStaffAccess(tenant, staffId, true);
    assertNoOverlap(dto.workingHours, 'INVALID_WORKING_HOURS');
    assertNoOverlap(dto.breaks, 'INVALID_BREAKS');
    const businessId = tenant.businessId;
    await this.prisma.$transaction([
      this.prisma.workingHours.deleteMany({ where: { staffId, businessId } }),
      this.prisma.recurringBreak.deleteMany({ where: { staffId, businessId } }),
      this.prisma.workingHours.createMany({
        data: dto.workingHours.map((r) => ({
          businessId,
          staffId,
          weekday: r.weekday,
          startMinute: r.startMinute,
          endMinute: r.endMinute,
        })),
      }),
      this.prisma.recurringBreak.createMany({
        data: dto.breaks.map((r) => ({
          businessId,
          staffId,
          weekday: r.weekday,
          startMinute: r.startMinute,
          endMinute: r.endMinute,
          label: r.label,
        })),
      }),
    ]);
    await this.audit.log({
      actorUserId,
      businessId,
      action: 'staff.schedule_update',
      targetType: 'Staff',
      targetId: staffId,
    });
    return this.getSchedule(tenant, staffId);
  }

  async addException(
    tenant: TenantContext,
    actorUserId: string,
    staffId: string,
    dto: CreateExceptionDto,
  ) {
    await this.assertStaffAccess(tenant, staffId, true);
    if (!dto.isClosed && dto.endMinute! <= dto.startMinute!) throw badRequest('INVALID_EXCEPTION');
    const ex = await this.prisma.scheduleException.create({
      data: {
        businessId: tenant.businessId,
        staffId,
        date: new Date(`${dto.date}T00:00:00Z`),
        isClosed: dto.isClosed,
        startMinute: dto.isClosed ? null : dto.startMinute,
        endMinute: dto.isClosed ? null : dto.endMinute,
        note: dto.note,
      },
    });
    await this.audit.log({
      actorUserId,
      businessId: tenant.businessId,
      action: 'staff.exception_add',
      targetType: 'Staff',
      targetId: staffId,
    });
    return { ...ex, date: dto.date };
  }

  async removeException(tenant: TenantContext, staffId: string, id: string) {
    await this.assertStaffAccess(tenant, staffId, true);
    const res = await this.prisma.scheduleException.deleteMany({
      where: { id, staffId, businessId: tenant.businessId },
    });
    if (!res.count) throw notFound('EXCEPTION_NOT_FOUND');
  }

  async addTimeOff(
    tenant: TenantContext,
    actorUserId: string,
    staffId: string,
    dto: CreateTimeOffDto,
  ) {
    const staff = await this.assertStaffAccess(tenant, staffId, true);
    const branch = await this.prisma.branch.findUniqueOrThrow({ where: { id: staff.branchId } });
    let startsAt: Date;
    let endsAt: Date;
    if (dto.fromDate && dto.toDate) {
      const from = DateTime.fromISO(dto.fromDate, { zone: branch.timezone }).startOf('day');
      const to = DateTime.fromISO(dto.toDate, { zone: branch.timezone })
        .plus({ days: 1 })
        .startOf('day');
      startsAt = from.toJSDate();
      endsAt = to.toJSDate();
    } else {
      startsAt = new Date(dto.startsAt!);
      endsAt = new Date(dto.endsAt!);
    }
    if (endsAt <= startsAt) throw badRequest('INVALID_RANGE');
    if (endsAt.getTime() - startsAt.getTime() > 366 * 86_400_000) throw badRequest('INVALID_RANGE');

    const conflicts = await this.prisma.appointment.count({
      where: {
        staffId,
        businessId: tenant.businessId,
        type: { in: ['ONLINE', 'WALK_IN'] },
        status: 'CONFIRMED',
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    const timeOff = await this.prisma.staffTimeOff.create({
      data: {
        businessId: tenant.businessId,
        staffId,
        type: dto.type,
        startsAt,
        endsAt,
        note: dto.note,
      },
    });
    await this.audit.log({
      actorUserId,
      businessId: tenant.businessId,
      action: 'staff.timeoff_add',
      targetType: 'Staff',
      targetId: staffId,
    });
    // Las citas existentes no se cancelan automáticamente: se informa para que el negocio decida.
    return { timeOff, conflictingAppointments: conflicts };
  }

  async removeTimeOff(tenant: TenantContext, staffId: string, id: string) {
    await this.assertStaffAccess(tenant, staffId, true);
    const res = await this.prisma.staffTimeOff.deleteMany({
      where: { id, staffId, businessId: tenant.businessId },
    });
    if (!res.count) throw notFound('TIME_OFF_NOT_FOUND');
  }

  private async resolveBranch(tx: Tx, businessId: string, branchId?: string) {
    if (branchId) {
      const b = await tx.branch.findFirst({ where: { id: branchId, businessId } });
      if (!b) throw badRequest('BRANCH_NOT_IN_BUSINESS');
      return b.id;
    }
    const first = await tx.branch.findFirst({
      where: { businessId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    if (!first) throw conflict('NO_ACTIVE_BRANCH');
    return first.id;
  }

  private async assignServices(tx: Tx, businessId: string, staffId: string, serviceIds: string[]) {
    const unique = [...new Set(serviceIds)];
    const found = await tx.service.count({ where: { businessId, id: { in: unique } } });
    if (found !== unique.length) throw badRequest('SERVICE_NOT_IN_BUSINESS');
    await tx.staffService.createMany({
      data: unique.map((serviceId) => ({ businessId, staffId, serviceId })),
    });
  }
}
