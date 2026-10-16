import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, onAuthChange, refreshSession, setAccessToken } from '@/services/api';
import type { Me } from '@/services/types';

interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous';
  me: Me | null;
  login: (email: string, password: string) => Promise<Me>;
  register: (payload: Record<string, unknown>) => Promise<{ businessId: string }>;
  logout: () => Promise<void>;
  reload: () => Promise<Me | null>;
}

const Ctx = createContext<AuthState | null>(null);
const HINT = 'has_session';

function hasSessionHint() {
  try {
    return localStorage.getItem(HINT) === '1';
  } catch {
    return false;
  }
}

function setSessionHint(on: boolean) {
  try {
    if (on) localStorage.setItem(HINT, '1');
    else localStorage.removeItem(HINT);
  } catch {
    /* almacenamiento no disponible */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>(() =>
    hasSessionHint() ? 'loading' : 'anonymous',
  );
  const [me, setMe] = useState<Me | null>(null);
  const qc = useQueryClient();

  const reload = useCallback(async () => {
    try {
      const data = await api<Me>('/auth/me');
      setMe(data);
      setStatus('authenticated');
      return data;
    } catch {
      setMe(null);
      setStatus('anonymous');
      return null;
    }
  }, []);

  useEffect(() => {
    // Restaurar la sesión desde la cookie httpOnly al cargar la aplicación.
    // Solo se intenta restaurar sesión si este navegador inició sesión antes (evita 401 en páginas públicas).
    if (hasSessionHint()) {
      void refreshSession().then((ok) => {
        if (ok) void reload();
        else setStatus('anonymous');
      });
    }
    const unsubscribe = onAuthChange((authenticated) => {
      if (!authenticated) {
        setMe(null);
        setStatus('anonymous');
      }
    });
    return () => {
      unsubscribe();
    };
  }, [reload]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ accessToken: string }>('/auth/login', {
        body: { email, password },
        auth: false,
      });
      setAccessToken(res.accessToken);
      setSessionHint(true);
      const data = await reload();
      return data!;
    },
    [reload],
  );

  const register = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await api<{ accessToken: string; businessId: string }>('/auth/register', {
        body: payload,
        auth: false,
      });
      setAccessToken(res.accessToken);
      setSessionHint(true);
      await reload();
      return { businessId: res.businessId };
    },
    [reload],
  );

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', auth: false }).catch(() => undefined);
    setAccessToken(null);
    setSessionHint(false);
    setMe(null);
    setStatus('anonymous');
    qc.clear();
  }, [qc]);

  const value = useMemo(
    () => ({ status, me, login, register, logout, reload }),
    [status, me, login, register, logout, reload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
