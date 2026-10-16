import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { StorageAdapter } from './storage.adapter';

/**
 * SOLO DESARROLLO Y PRUEBAS. Guarda archivos en disco local y los sirve en /api/media.
 * La configuración rechaza este adaptador cuando NODE_ENV=production.
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'local-dev';
  readonly bucket = 'local';
  readonly root: string;

  constructor(dir: string) {
    this.root = resolve(dir);
  }

  resolvePath(path: string): string {
    const full = resolve(this.root, path);
    if (!full.startsWith(this.root + sep)) throw new Error('Ruta fuera del almacenamiento');
    return full;
  }

  async put(path: string, data: Buffer) {
    const full = this.resolvePath(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data, { flag: 'wx' });
  }

  async remove(paths: string[]) {
    await Promise.all(paths.map((p) => rm(this.resolvePath(p), { force: true })));
  }
}
