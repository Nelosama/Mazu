/**
 * Motor de disponibilidad — funciones puras, sin acceso a base de datos.
 *
 * Convenciones:
 * - Los instantes se representan como milisegundos epoch (UTC).
 * - Los horarios recurrentes se expresan en minutos locales desde medianoche en la zona IANA
 *   de la sucursal. La conversión a instantes se hace con "hora de pared" (Luxon), de modo
 *   que una jornada 09:00–18:00 sigue siendo 09:00–18:00 local tras un cambio de horario.
 * - Todos los intervalos son semiabiertos [start, end).
 */
import { DateTime } from 'luxon';

export interface Interval {
  start: number;
  end: number;
}

export interface WeeklyRange {
  weekday: number; // ISO 1 = lunes … 7 = domingo
  startMinute: number;
  endMinute: number;
}

export interface ExceptionRange {
  isClosed: boolean;
  startMinute: number | null;
  endMinute: number | null;
}

export interface StaffScheduleInput {
  timezone: string;
  weeklyHours: WeeklyRange[];
  breaks: WeeklyRange[];
  /** Excepciones indexadas por fecha local YYYY-MM-DD. */
  exceptions: Map<string, ExceptionRange[]>;
  /** Ocupaciones (citas no canceladas, bloqueos, vacaciones) en UTC. */
  busy: Interval[];
}

export interface SlotQuery {
  durationMinutes: number;
  stepMinutes: number;
  /** Primer inicio permitido (ahora + antelación mínima). */
  earliestStart: number;
  /** Último inicio permitido (ahora + antelación máxima). */
  latestStart: number;
}

/** Convierte (fecha local, minuto local) a instante UTC respetando la zona horaria. */
export function localMinuteToInstant(date: string, minute: number, timezone: string): number {
  const day = DateTime.fromISO(date, { zone: timezone });
  if (!day.isValid) throw new Error(`Fecha o zona inválida: ${date} ${timezone}`);
  if (minute >= 1440) return day.plus({ days: 1 }).startOf('day').toMillis();
  return DateTime.fromObject(
    { year: day.year, month: day.month, day: day.day, hour: Math.floor(minute / 60), minute: minute % 60 },
    { zone: timezone },
  ).toMillis();
}

export function isoWeekday(date: string, timezone: string): number {
  return DateTime.fromISO(date, { zone: timezone }).weekday;
}

/** Une intervalos solapados o contiguos. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** Resta `remove` de `base`. */
export function subtractIntervals(base: Interval[], remove: Interval[]): Interval[] {
  const cuts = mergeIntervals(remove);
  let result = mergeIntervals(base);
  for (const c of cuts) {
    const next: Interval[] = [];
    for (const r of result) {
      if (c.end <= r.start || c.start >= r.end) {
        next.push(r);
        continue;
      }
      if (c.start > r.start) next.push({ start: r.start, end: c.start });
      if (c.end < r.end) next.push({ start: c.end, end: r.end });
    }
    result = next;
  }
  return result;
}

/** Intervalos laborables de un día local, ya descontados los descansos recurrentes. */
export function workingIntervalsForDate(date: string, schedule: Omit<StaffScheduleInput, 'busy'>): Interval[] {
  const { timezone } = schedule;
  const toInterval = (r: { startMinute: number; endMinute: number }): Interval => ({
    start: localMinuteToInstant(date, r.startMinute, timezone),
    end: localMinuteToInstant(date, r.endMinute, timezone),
  });

  const exceptions = schedule.exceptions.get(date);
  if (exceptions && exceptions.length > 0) {
    // Una excepción reemplaza el horario semanal completo de ese día.
    if (exceptions.some((e) => e.isClosed)) return [];
    return mergeIntervals(
      exceptions
        .filter((e) => e.startMinute !== null && e.endMinute !== null)
        .map((e) => toInterval({ startMinute: e.startMinute!, endMinute: e.endMinute! })),
    );
  }

  const weekday = isoWeekday(date, timezone);
  const hours = schedule.weeklyHours.filter((h) => h.weekday === weekday).map(toInterval);
  const breaks = schedule.breaks.filter((b) => b.weekday === weekday).map(toInterval);
  return subtractIntervals(hours, breaks);
}

/** Inicios disponibles (ms epoch) para un profesional en un día local. */
export function computeDaySlots(date: string, schedule: StaffScheduleInput, query: SlotQuery): number[] {
  const durationMs = query.durationMinutes * 60_000;
  const stepMs = query.stepMinutes * 60_000;
  if (durationMs <= 0 || stepMs <= 0) return [];

  const free = subtractIntervals(workingIntervalsForDate(date, schedule), schedule.busy);
  const slots: number[] = [];
  for (const interval of free) {
    // Alinear al primer múltiplo del paso dentro del tramo libre, contado desde el inicio
    // del día local para que la rejilla sea estable (09:00, 09:15, …) aunque haya huecos.
    const dayStart = localMinuteToInstant(date, 0, schedule.timezone);
    let t = dayStart + Math.ceil((interval.start - dayStart) / stepMs) * stepMs;
    for (; t + durationMs <= interval.end; t += stepMs) {
      if (t < query.earliestStart || t > query.latestStart) continue;
      slots.push(t);
    }
  }
  return slots;
}

/** Ventana UTC que cubre un día local completo, útil para cargar ocupaciones. */
export function dayWindow(date: string, timezone: string): Interval {
  return { start: localMinuteToInstant(date, 0, timezone), end: localMinuteToInstant(date, 1440, timezone) };
}

/** Lista de fechas locales entre `from` y `to` (inclusive). */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  let d = DateTime.fromISO(from, { zone: 'utc' });
  const end = DateTime.fromISO(to, { zone: 'utc' });
  while (d <= end && out.length < 400) {
    out.push(d.toISODate()!);
    d = d.plus({ days: 1 });
  }
  return out;
}
