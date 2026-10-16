import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui';
import { BUSINESS_TYPES, COUNTRY_DEFAULTS, countries, currencies, timezones } from '@/lib/regions';
import { LANGUAGES } from '@/i18n';

export interface RegionalValues {
  type: string;
  country: string;
  currency: string;
  timezone: string;
  locale: string;
}

/** Tipo de negocio + configuración regional (país, moneda ISO 4217, zona IANA, idioma). */
export function BusinessFields({
  value,
  onChange,
  showType = true,
}: {
  value: RegionalValues;
  onChange: (v: RegionalValues) => void;
  showType?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const countryList = useMemo(() => countries(i18n.language), [i18n.language]);
  const currencyList = useMemo(() => currencies(i18n.language), [i18n.language]);
  const tzList = useMemo(() => timezones(), []);
  const set = (patch: Partial<RegionalValues>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {showType && (
        <Select
          label={t('auth.businessType')}
          value={value.type}
          onChange={(e) => set({ type: e.target.value })}
        >
          {BUSINESS_TYPES.map((b) => (
            <option key={b} value={b}>
              {t(`businessTypes.${b}`)}
            </option>
          ))}
        </Select>
      )}
      <Select
        label={t('auth.country')}
        value={value.country}
        onChange={(e) => {
          const d = COUNTRY_DEFAULTS[e.target.value];
          set({ country: e.target.value, ...(d ?? {}) });
        }}
      >
        {countryList.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select
        label={t('auth.currency')}
        value={value.currency}
        onChange={(e) => set({ currency: e.target.value })}
      >
        {currencyList.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.name}
          </option>
        ))}
      </Select>
      <Select
        label={t('auth.timezone')}
        value={value.timezone}
        onChange={(e) => set({ timezone: e.target.value })}
      >
        {tzList.map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, ' ')}
          </option>
        ))}
      </Select>
      <Select
        label={t('auth.businessLanguage')}
        value={value.locale}
        onChange={(e) => set({ locale: e.target.value })}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
