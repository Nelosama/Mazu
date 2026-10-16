import { DateTime, IANAZone } from 'luxon';
import { registerDecorator, ValidationOptions } from 'class-validator';

export const SUPPORTED_LOCALES = ['es', 'en', 'pt'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function isValidTimezone(tz: unknown): tz is string {
  return typeof tz === 'string' && tz.length <= 64 && IANAZone.isValidZone(tz);
}

const currencyCodes = new Set(
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : [],
);

export function isValidCurrency(code: unknown): code is string {
  return (
    typeof code === 'string' &&
    /^[A-Z]{3}$/.test(code) &&
    (currencyCodes.size === 0 || currencyCodes.has(code))
  );
}

export function isValidCountry(code: unknown): code is string {
  if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code)) return false;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' }).of(code);
    return Boolean(name);
  } catch {
    return false;
  }
}

export function isLocalDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    DateTime.fromISO(value, { zone: 'utc' }).isValid
  );
}

function simpleDecorator(name: string, check: (v: unknown) => boolean, message: string) {
  return (options?: ValidationOptions) => (object: object, propertyName: string) =>
    registerDecorator({
      name,
      target: object.constructor,
      propertyName,
      options: { message, ...options },
      validator: { validate: (v: unknown) => check(v) },
    });
}

export const IsTimezone = simpleDecorator(
  'isTimezone',
  isValidTimezone,
  '$property debe ser una zona horaria IANA',
);
export const IsCurrencyCode = simpleDecorator(
  'isCurrencyCode',
  isValidCurrency,
  '$property debe ser ISO 4217',
);
export const IsCountryCode = simpleDecorator(
  'isCountryCode',
  isValidCountry,
  '$property debe ser ISO 3166-1 alfa-2',
);
export const IsLocalDate = simpleDecorator(
  'isLocalDate',
  isLocalDate,
  '$property debe tener formato YYYY-MM-DD',
);

export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
}
