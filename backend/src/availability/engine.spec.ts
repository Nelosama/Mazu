import { DateTime } from 'luxon';
import {
  computeDaySlots,
  dayWindow,
  localMinuteToInstant,
  mergeIntervals,
  StaffScheduleInput,
  subtractIntervals,
  workingIntervalsForDate,
} from './engine';

const H = (h: number, m = 0) => h * 60 + m;
const wall = (ms: number, tz: string) => DateTime.fromMillis(ms, { zone: tz }).toFormat('HH:mm');

function schedule(partial: Partial<StaffScheduleInput> & { timezone: string }): StaffScheduleInput {
  return { weeklyHours: [], breaks: [], exceptions: new Map(), busy: [], ...partial };
}

const OPEN = { earliestStart: 0, latestStart: Number.MAX_SAFE_INTEGER };

describe('interval helpers', () => {
  it('merges overlapping and adjacent intervals', () => {
    expect(mergeIntervals([{ start: 5, end: 10 }, { start: 0, end: 5 }, { start: 12, end: 15 }])).toEqual([
      { start: 0, end: 10 },
      { start: 12, end: 15 },
    ]);
  });

  it('subtracts intervals', () => {
    expect(subtractIntervals([{ start: 0, end: 100 }], [{ start: 20, end: 30 }, { start: 90, end: 120 }])).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 90 },
    ]);
  });
});

describe('computeDaySlots', () => {
  const tz = 'America/Tegucigalpa'; // UTC-6 sin horario de verano
  const base = schedule({
    timezone: tz,
    weeklyHours: [{ weekday: 1, startMinute: H(9), endMinute: H(12) }],
    breaks: [{ weekday: 1, startMinute: H(10), endMinute: H(10, 30) }],
  });

  it('respects working hours, breaks and duration', () => {
    // 2026-10-19 es lunes.
    const slots = computeDaySlots('2026-10-19', base, { durationMinutes: 30, stepMinutes: 15, ...OPEN });
    expect(slots.map((s) => wall(s, tz))).toEqual([
      '09:00', '09:15', '09:30',
      '10:30', '10:45', '11:00', '11:15', '11:30',
    ]);
  });

  it('returns nothing on days without working hours (day off)', () => {
    expect(computeDaySlots('2026-10-20', base, { durationMinutes: 30, stepMinutes: 15, ...OPEN })).toEqual([]);
  });

  it('excludes busy intervals using half-open ranges', () => {
    const busyStart = localMinuteToInstant('2026-10-19', H(9, 30), tz);
    const s = { ...base, busy: [{ start: busyStart, end: busyStart + 30 * 60_000 }] };
    const slots = computeDaySlots('2026-10-19', s, { durationMinutes: 30, stepMinutes: 30, ...OPEN });
    // 09:00–09:30 termina justo cuando empieza la ocupación: permitido.
    expect(slots.map((x) => wall(x, tz))).toEqual(['09:00', '10:30', '11:00', '11:30']);
  });

  it('applies minimum lead time and maximum advance', () => {
    const earliest = localMinuteToInstant('2026-10-19', H(11), tz);
    const latest = localMinuteToInstant('2026-10-19', H(11, 15), tz);
    const slots = computeDaySlots('2026-10-19', base, {
      durationMinutes: 15,
      stepMinutes: 15,
      earliestStart: earliest,
      latestStart: latest,
    });
    expect(slots.map((x) => wall(x, tz))).toEqual(['11:00', '11:15']);
  });

  it('closed exceptions override weekly hours', () => {
    const s = { ...base, exceptions: new Map([['2026-10-19', [{ isClosed: true, startMinute: null, endMinute: null }]]]) };
    expect(computeDaySlots('2026-10-19', s, { durationMinutes: 30, stepMinutes: 15, ...OPEN })).toEqual([]);
  });

  it('custom-hours exceptions replace weekly hours (even on a day off)', () => {
    const s = { ...base, exceptions: new Map([['2026-10-20', [{ isClosed: false, startMinute: H(14), endMinute: H(15) }]]]) };
    const slots = computeDaySlots('2026-10-20', s, { durationMinutes: 60, stepMinutes: 15, ...OPEN });
    expect(slots.map((x) => wall(x, tz))).toEqual(['14:00']);
  });
});

describe('time zones and DST', () => {
  it('keeps local wall-clock hours on the US spring-forward day', () => {
    const tz = 'America/New_York';
    // 2026-03-08: los relojes pasan de 02:00 a 03:00.
    const s = schedule({ timezone: tz, weeklyHours: [{ weekday: 7, startMinute: H(9), endMinute: H(11) }] });
    const slots = computeDaySlots('2026-03-08', s, { durationMinutes: 60, stepMinutes: 60, ...OPEN });
    expect(slots.map((x) => wall(x, tz))).toEqual(['09:00', '10:00']);
    expect(new Date(slots[0]).toISOString()).toBe('2026-03-08T13:00:00.000Z'); // EDT = UTC-4
    const dayBefore = computeDaySlots('2026-03-01', s, { durationMinutes: 60, stepMinutes: 60, ...OPEN });
    expect(new Date(dayBefore[0]).toISOString()).toBe('2026-03-01T14:00:00.000Z'); // EST = UTC-5
  });

  it('handles a working range that crosses the fall-back hour', () => {
    const tz = 'Europe/Madrid';
    // 2026-10-25: 03:00 vuelve a 02:00 → el tramo 00:00–06:00 dura 7 horas reales.
    const s = schedule({ timezone: tz, weeklyHours: [{ weekday: 7, startMinute: H(0), endMinute: H(6) }] });
    const [interval] = workingIntervalsForDate('2026-10-25', s);
    expect((interval.end - interval.start) / 3_600_000).toBe(7);
    const slots = computeDaySlots('2026-10-25', s, { durationMinutes: 60, stepMinutes: 60, ...OPEN });
    expect(slots).toHaveLength(7);
  });

  it('day window of a 23-hour DST day', () => {
    const w = dayWindow('2026-03-29', 'Europe/Madrid');
    expect((w.end - w.start) / 3_600_000).toBe(23);
  });

  it('the same local schedule maps to different UTC instants per time zone', () => {
    const mk = (tz: string) =>
      computeDaySlots('2026-10-19', schedule({ timezone: tz, weeklyHours: [{ weekday: 1, startMinute: H(9), endMinute: H(10) }] }), {
        durationMinutes: 60,
        stepMinutes: 60,
        ...OPEN,
      })[0];
    expect(new Date(mk('America/Mexico_City')).toISOString()).toBe('2026-10-19T15:00:00.000Z');
    expect(new Date(mk('America/Sao_Paulo')).toISOString()).toBe('2026-10-19T12:00:00.000Z');
    expect(new Date(mk('Asia/Kolkata')).toISOString()).toBe('2026-10-19T03:30:00.000Z');
  });
});
