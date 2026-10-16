import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage } from '@/i18n';
import { cn } from '@/lib/cn';

export function LanguageSwitcher({ compact }: { compact?: boolean }) {
  const { i18n, t } = useTranslation();
  return (
    <select
      aria-label={t('common.language')}
      value={i18n.language.slice(0, 2)}
      onChange={(e) => setLanguage(e.target.value)}
      className={cn(
        'rounded-lg border-0 py-1.5 pl-2.5 pr-7 text-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand',
        compact ? 'bg-white/90 shadow-sm backdrop-blur' : 'bg-white',
      )}
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {compact ? l.code.toUpperCase() : l.label}
        </option>
      ))}
    </select>
  );
}
