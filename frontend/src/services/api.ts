/**
 * Cliente HTTP. El token de acceso vive solo en memoria; la sesión se renueva con la
 * cookie httpOnly de refresh (ruta /api/auth, mismo origen gracias al proxy).
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<(authenticated: boolean) => void>();

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function onAuthChange(fn: (authenticated: boolean) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok) {
        setAccessToken(null);
        return false;
      }
      const body = (await res.json()) as { accessToken: string };
      setAccessToken(body.accessToken);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type Body = Record<string, unknown> | unknown[] | FormData | undefined;

interface RequestOptions {
  method?: string;
  body?: Body;
  query?: Record<string, string | number | undefined | null>;
  auth?: boolean;
  signal?: AbortSignal;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const doFetch = () => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.body && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (accessToken && opts.auth !== false) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(url, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      headers,
      credentials: 'same-origin',
      signal: opts.signal,
      body:
        opts.body instanceof FormData
          ? opts.body
          : opts.body
            ? JSON.stringify(opts.body)
            : undefined,
    });
  };

  let res = await doFetch().catch(() => {
    throw new ApiError(0, 'NETWORK_ERROR', 'Network error');
  });
  if (res.status === 401 && opts.auth !== false && accessToken !== null) {
    if (await refreshSession()) res = await doFetch();
    else listeners.forEach((l) => l(false));
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const err = (data?.error ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(res.status, err.code ?? 'ERROR', err.message ?? res.statusText, err.details);
  }
  return data as T;
}
