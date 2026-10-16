/** Listas regionales derivadas de Intl (sin tablas codificadas a mano). */

export function timezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
}

export function currencies(locale: string): { code: string; name: string }[] {
  let codes: string[] = [];
  try {
    codes = Intl.supportedValuesOf('currency');
  } catch {
    codes = ['USD', 'EUR', 'MXN', 'COP', 'PEN', 'CLP', 'ARS', 'BRL', 'HNL', 'GTQ', 'CRC', 'DOP'];
  }
  const names = new Intl.DisplayNames([locale], { type: 'currency' });
  return codes.map((code) => ({ code, name: names.of(code) ?? code }));
}

const REGION_CODES =
  'AR BO BR CL CO CR CU DO EC SV GT HN MX NI PA PY PE PR UY VE US CA ES PT GB FR DE IT'.split(' ');

export function countries(locale: string): { code: string; name: string }[] {
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  const all = new Set(REGION_CODES);
  const probe = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
  // Completa con todos los códigos ISO 3166-1 alfa-2 conocidos por el navegador.
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      try {
        const n = probe.of(code);
        if (n && n !== code && !/^[A-Z]{2}$/.test(n)) all.add(code);
      } catch {
        /* código inválido */
      }
    }
  return [...all]
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((x, y) => x.name.localeCompare(y.name, locale));
}

/** Valores sugeridos al elegir país (el usuario puede cambiarlos). */
export const COUNTRY_DEFAULTS: Record<
  string,
  { currency: string; timezone: string; locale: string }
> = {
  HN: { currency: 'HNL', timezone: 'America/Tegucigalpa', locale: 'es' },
  MX: { currency: 'MXN', timezone: 'America/Mexico_City', locale: 'es' },
  CO: { currency: 'COP', timezone: 'America/Bogota', locale: 'es' },
  PE: { currency: 'PEN', timezone: 'America/Lima', locale: 'es' },
  CL: { currency: 'CLP', timezone: 'America/Santiago', locale: 'es' },
  AR: { currency: 'ARS', timezone: 'America/Argentina/Buenos_Aires', locale: 'es' },
  GT: { currency: 'GTQ', timezone: 'America/Guatemala', locale: 'es' },
  SV: { currency: 'USD', timezone: 'America/El_Salvador', locale: 'es' },
  CR: { currency: 'CRC', timezone: 'America/Costa_Rica', locale: 'es' },
  PA: { currency: 'USD', timezone: 'America/Panama', locale: 'es' },
  DO: { currency: 'DOP', timezone: 'America/Santo_Domingo', locale: 'es' },
  EC: { currency: 'USD', timezone: 'America/Guayaquil', locale: 'es' },
  BO: { currency: 'BOB', timezone: 'America/La_Paz', locale: 'es' },
  PY: { currency: 'PYG', timezone: 'America/Asuncion', locale: 'es' },
  UY: { currency: 'UYU', timezone: 'America/Montevideo', locale: 'es' },
  NI: { currency: 'NIO', timezone: 'America/Managua', locale: 'es' },
  VE: { currency: 'VES', timezone: 'America/Caracas', locale: 'es' },
  BR: { currency: 'BRL', timezone: 'America/Sao_Paulo', locale: 'pt' },
  PT: { currency: 'EUR', timezone: 'Europe/Lisbon', locale: 'pt' },
  ES: { currency: 'EUR', timezone: 'Europe/Madrid', locale: 'es' },
  US: { currency: 'USD', timezone: 'America/New_York', locale: 'en' },
  CA: { currency: 'CAD', timezone: 'America/Toronto', locale: 'en' },
  GB: { currency: 'GBP', timezone: 'Europe/London', locale: 'en' },
};

export const BUSINESS_TYPES = [
  'BARBERSHOP',
  'BEAUTY_SALON',
  'NAIL_STUDIO',
  'AESTHETICS',
  'SPA',
  'OTHER',
] as const;
