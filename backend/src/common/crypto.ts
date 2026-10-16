import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Token opaco de 256 bits, apto para URL. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Los tokens se guardan solo como hash SHA-256: una fuga de la BD no expone enlaces válidos. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Formato de token válido: evita consultas a la BD con entradas basura. */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(token);
}
