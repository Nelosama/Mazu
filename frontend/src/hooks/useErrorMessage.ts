import { useTranslation } from 'react-i18next';
import { ApiError } from '@/services/api';

/** Traduce códigos de error de la API a mensajes comprensibles. */
export function useErrorMessage() {
  const { t, i18n } = useTranslation();
  return (err: unknown): string => {
    if (err instanceof ApiError) {
      const key = `errors.${err.code}`;
      if (i18n.exists(key)) return t(key);
      if (err.status === 0) return t('errors.NETWORK_ERROR');
      if (err.status >= 500) return t('errors.INTERNAL_ERROR');
    }
    return t('errors.GENERIC');
  };
}
