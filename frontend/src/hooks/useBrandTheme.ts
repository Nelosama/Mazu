import { useEffect } from 'react';
import { applyTheme, buildTheme, DEFAULT_BRAND } from '@/lib/theme';

/** Aplica el color del negocio mientras el componente está montado. */
export function useBrandTheme(color: string | null | undefined) {
  useEffect(() => {
    applyTheme(buildTheme(color));
    return () => applyTheme(buildTheme(DEFAULT_BRAND));
  }, [color]);
}
