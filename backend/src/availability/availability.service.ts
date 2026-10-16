import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { badRequest, notFound } from '../common/errors';
import {
  computeDaySlots,
  dateRange,
  dayWindow,
  ExceptionRange,
  Interval,
  StaffScheduleInput,
} from './engine';

export interface BusinessRules {
  id: string;
  timezone: string;
  slotIntervalMinutes: number;
  minLeadMinutes: number;
  maxAdvanceDays: number;
}

export interface SlotResult {
  startsAt: string;
  endsAt: string;
  staffIds: string[];
}

export interface AvailabilityQuery {
  serviceId: string;
  staffId?: string | null;
  from: string;
  to: string;
  /** Cita excluida del cálculo de ocupación (para reprogramar). */
  excludeAppointmentId?: string;
  /** Ignora la antelación mínima (uso administrativo). */
  ignoreLeadTime?: boolean;
  now?: Date;
}

const MAX_RANGE_DAYS = 31;

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcula los horarios disponibles por día. La respuesta no contiene ningún dato
   * de otras reservas: solo inicios libres y qué profesionales pueden atenderlos.
   */
  async slots(
    business: BusinessRules,
    q: AvailabilityQuery,
    tx?: Tx,
  ): Promise<Map<string, SlotResult[]>> {
    const db = tx ?? this.prisma;
    const days = dateRange(q.from, q.to);
    if (days.length === 0 || days.length > MAX_RANGE_DAYS) throw badRequest('INVALID_DATE_RANGE');

    const service = await db.service.findFirst({
      where: { id: q.serviceId, businessId: business.id, active: true },
    });
    if (!service) throw notFound('SERVICE_NOT_FOUND');

    const staffList = await db.staff.findMany({
      where: {
        businessId: business.id,
        active: true,
        branch: { status: 'ACTIVE' },
        services: { some: { serviceId: service.id } },
        ...(q.staffId ? { id: q.staffId } : {}),
      },
      include: {
        branch: { select: { timezone: true } },
        workingHours: true,
        recurringBreaks: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    if (q.staffId && staffList.length === 0) throw notFound('STAFF_NOT_FOUND');

    const now = (q.now ?? new Date()).getTime();
    const earliestStart = q.ignoreLeadTime ? now : now + business.minLeadMinutes * 60_000;
    const latestStart = now + business.maxAdvanceDays * 86_400_000;

    // Ventana UTC amplia que cubre todas las zonas posibles del rango.
    const windowStart = new Date(dayWindow(days[0], business.timezone).start - 36 * 3_600_000);
    const windowEnd = new Date(
      dayWindow(days[days.length - 1], business.timezone).end + 36 * 3_600_000,
    );
    const staffIds = staffList.map((s) => s.id);

    const [appointments, timeOff, exceptions] = await Promise.all([
      db.appointment.findMany({
        where: {
          businessId: business.id,
          staffId: { in: staffIds },
          status: { not: 'CANCELED' },
          startsAt: { lt: windowEnd },
          endsAt: { gt: windowStart },
          ...(q.excludeAppointmentId ? { id: { not: q.excludeAppointmentId } } : {}),
        },
        select: { staffId: true, startsAt: true, endsAt: true },
      }),
      db.staffTimeOff.findMany({
        where: {
          businessId: business.id,
          staffId: { in: staffIds },
          startsAt: { lt: windowEnd },
          endsAt: { gt: windowStart },
        },
        select: { staffId: true, startsAt: true, endsAt: true },
      }),
      db.scheduleException.findMany({
        where: {
          businessId: business.id,
          staffId: { in: staffIds },
          date: {
            gte: new Date(`${DateTime.fromISO(days[0]).minus({ days: 1 }).toISODate()}T00:00:00Z`),
            lte: new Date(
              `${DateTime.fromISO(days[days.length - 1])
                .plus({ days: 1 })
                .toISODate()}T00:00:00Z`,
            ),
          },
        },
      }),
    ]);

    const busyByStaff = new Map<string, Interval[]>();
    for (const b of [...appointments, ...timeOff]) {
      const list = busyByStaff.get(b.staffId) ?? [];
      list.push({ start: b.startsAt.getTime(), end: b.endsAt.getTime() });
      busyByStaff.set(b.staffId, list);
    }
    const exceptionsByStaff = new Map<string, Map<string, ExceptionRange[]>>();
    for (const e of exceptions) {
      const byDate = exceptionsByStaff.get(e.staffId) ?? new Map<string, ExceptionRange[]>();
      const key = DateTime.fromJSDate(e.date, { zone: 'utc' }).toISODate()!;
      byDate.set(key, [...(byDate.get(key) ?? []), e]);
      exceptionsByStaff.set(e.staffId, byDate);
    }

    const durationMs = service.durationMinutes * 60_000;
    const result = new Map<string, SlotResult[]>();
    for (const day of days) {
      const byStart = new Map<number, string[]>();
      for (const staff of staffList) {
        const schedule: StaffScheduleInput = {
          timezone: staff.branch.timezone,
          weeklyHours: staff.workingHours,
          breaks: staff.recurringBreaks,
          exceptions: exceptionsByStaff.get(staff.id) ?? new Map(),
          busy: busyByStaff.get(staff.id) ?? [],
        };
        const starts = computeDaySlots(day, schedule, {
          durationMinutes: service.durationMinutes,
          stepMinutes: business.slotIntervalMinutes,
          earliestStart,
          latestStart,
        });
        for (const s of starts) byStart.set(s, [...(byStart.get(s) ?? []), staff.id]);
      }
      result.set(
        day,
        [...byStart.entries()]
          .sort(([a], [b]) => a - b)
          .map(([start, ids]) => ({
            startsAt: new Date(start).toISOString(),
            endsAt: new Date(start + durationMs).toISOString(),
            staffIds: ids,
          })),
      );
    }
    return result;
  }

  /** Comprueba que un inicio concreto está disponible para un profesional. */
  async isStartAvailable(
    business: BusinessRules,
    params: {
      serviceId: string;
      staffId: string;
      startsAt: Date;
      excludeAppointmentId?: string;
      ignoreLeadTime?: boolean;
    },
    tx?: Tx,
  ): Promise<boolean> {
    const staff = await (tx ?? this.prisma).staff.findFirst({
      where: { id: params.staffId, businessId: business.id },
      include: { branch: { select: { timezone: true } } },
    });
    if (!staff) return false;
    const day = DateTime.fromJSDate(params.startsAt, { zone: staff.branch.timezone }).toISODate()!;
    const slots = await this.slots(
      business,
      {
        serviceId: params.serviceId,
        staffId: params.staffId,
        from: day,
        to: day,
        excludeAppointmentId: params.excludeAppointmentId,
        ignoreLeadTime: params.ignoreLeadTime,
      },
      tx,
    );
    const target = params.startsAt.toISOString();
    return (slots.get(day) ?? []).some((s) => s.startsAt === target);
  }
}
