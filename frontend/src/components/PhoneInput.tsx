import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { countryOptions } from '@/lib/phone';
import { cn } from '@/lib/cn';

interface Props {
  country: string;
  number: string;
  onChange: (v: { country: string; number: string }) => void;
  label: string;
  error?: string;
  hint?: string;
}

/** Teléfono internacional: selector de país + número nacional. Se normaliza a E.164 al enviar. */
export function PhoneInput({ country, number, onChange, label, error, hint }: Props) {
  const { i18n, t } = useTranslation();
  const id = useId();
  const options = useMemo(() => countryOptions(i18n.language), [i18n.language]);
  const current = options.find((o) => o.code === country);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <div
        className={cn(
          'flex rounded-xl bg-white shadow-sm ring-1 ring-inset focus-within:ring-2 focus-within:ring-brand',
          error ? 'ring-red-400' : 'ring-gray-300',
        )}
      >
        <div className="relative">
          <select
            aria-label={t('booking.country')}
            value={country}
            onChange={(e) => onChange({ country: e.target.value, number })}
            className="h-full appearance-none rounded-l-xl border-0 bg-transparent py-2.5 pl-3 pr-7 text-base text-transparent focus:ring-0 sm:text-sm"
          >
            {options.map((o) => (
              <option key={o.code} value={o.code} className="text-gray-900">
                {o.flag} {o.name} ({o.dial})
              </option>
            ))}
          </select>
          <span
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center gap-1 text-base sm:text-sm"
            aria-hidden
          >
            <span>{current?.flag}</span>
            <span className="text-gray-600">{current?.dial}</span>
            <svg className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
              <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" />
            </svg>
          </span>
        </div>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={number}
          onChange={(e) => onChange({ country, number: e.target.value })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className="min-w-0 flex-1 rounded-r-xl border-0 bg-transparent py-2.5 pl-2 pr-3 text-base focus:ring-0 sm:text-sm"
        />
      </div>
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}
