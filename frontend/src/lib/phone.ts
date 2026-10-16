import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';

export interface CountryOption {
  code: CountryCode;
  dial: string;
  name: string;
  flag: string;
}

const flag = (code: string) =>
  String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

const cache = new Map<string, CountryOption[]>();

/** Países con prefijo telefónico, ordenados por nombre en el idioma actual. */
export function countryOptions(locale: string): CountryOption[] {
  if (cache.has(locale)) return cache.get(locale)!;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: 'region' });
  } catch {
    names = null;
  }
  const list = getCountries()
    .map((code) => ({
      code,
      dial: `+${getCountryCallingCode(code)}`,
      name: names?.of(code) ?? code,
      flag: flag(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  cache.set(locale, list);
  return list;
}

/** Devuelve el número en E.164 o null si no es válido para el país. */
export function toE164(input: string, country: string): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), country as CountryCode);
  return parsed && parsed.isValid() ? parsed.number : null;
}

export function formatAsYouType(input: string, country: string) {
  return new AsYouType(country as CountryCode).input(input);
}
