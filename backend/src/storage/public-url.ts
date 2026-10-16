import { env } from '../config/env';

/** Construye la URL pública de un objeto almacenado (solo bucket público de imágenes del negocio). */
export function publicFileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const e = env();
  if (e.STORAGE_DRIVER === 'supabase' && e.SUPABASE_URL) {
    return `${e.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${e.SUPABASE_STORAGE_BUCKET}/${path}`;
  }
  return `/api/media/${path}`;
}
