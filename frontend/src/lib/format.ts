import { DateTime } from 'luxon';

export function formatMoney(amount: string | number, currency: string, locale: string) {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatDuration(minutes: number, locale: string) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const unit = (u: 'hour' | 'minute', v: number) =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: u, unitDisplay: 'short' }).format(v);
  if (h && m) return `${unit('hour', h)} ${unit('minute', m)}`;
  return h ? unit('hour', h) : unit('minute', m);
}

export const dt = (iso: string, zone: string, locale: string) =>
  DateTime.fromISO(iso, { zone }).setLocale(locale);

export function formatTime(iso: string, zone: string, locale: string) {
  return dt(iso, zone, locale).toLocaleString(DateTime.TIME_SIMPLE);
}

export function formatDate(iso: string, zone: string, locale: string) {
  return dt(iso, zone, locale).toLocaleString({ weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatDateTime(iso: string, zone: string, locale: string) {
  return dt(iso, zone, locale).toLocaleString({
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function minutesToHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export function hhmmToMinutes(v: string) {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
