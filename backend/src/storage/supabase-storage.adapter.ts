import { Logger } from '@nestjs/common';
import { StorageAdapter } from './storage.adapter';

/**
 * Adaptador de Supabase Storage vía API REST. La clave service_role solo vive en el backend.
 * El bucket debe existir y ser público (solo contiene imágenes que el negocio publica).
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  readonly name = 'supabase';
  private readonly logger = new Logger(SupabaseStorageAdapter.name);

  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    readonly bucket: string,
  ) {}

  private endpoint(path: string) {
    return `${this.url.replace(/\/$/, '')}/storage/v1/object/${this.bucket}/${path}`;
  }

  async put(path: string, data: Buffer, contentType: string) {
    const res = await fetch(this.endpoint(path), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.serviceKey}`,
        apikey: this.serviceKey,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'x-upsert': 'false',
      },
      body: new Uint8Array(data),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase Storage put falló (${res.status}): ${text.slice(0, 200)}`);
    }
  }

  async remove(paths: string[]) {
    if (!paths.length) return;
    const res = await fetch(`${this.url.replace(/\/$/, '')}/storage/v1/object/${this.bucket}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.serviceKey}`,
        apikey: this.serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!res.ok) this.logger.warn(`No se pudieron eliminar objetos (${res.status})`);
  }
}
