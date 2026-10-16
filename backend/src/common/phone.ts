import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

/**
 * Normaliza un teléfono a E.164. Acepta un número con prefijo internacional
 * o un número nacional más el país por defecto.
 */
export function normalizePhone(input: string, defaultCountry?: string): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 32) return null;
  const parsed = parsePhoneNumberFromString(
    trimmed,
    defaultCountry ? (defaultCountry.toUpperCase() as CountryCode) : undefined,
  );
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

export function maskPhone(e164: string): string {
  if (e164.length <= 6) return '***';
  return `${e164.slice(0, 4)}${'•'.repeat(Math.max(0, e164.length - 7))}${e164.slice(-3)}`;
}
