import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Base de datos E2E dedicada: se migra, se vacía y se carga la demo en cada ejecución. */
export default async function globalSetup() {
  const url =
    process.env.E2E_DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/booking_e2e?schema=public';
  if (!/e2e/.test(url))
    throw new Error('E2E_DATABASE_URL debe apuntar a una base de datos de pruebas E2E');
  const env = { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url, NODE_ENV: 'test' };
  const backend = resolve(import.meta.dirname, '../backend');
  execSync('npx prisma migrate deploy --schema ../prisma/schema.prisma', {
    cwd: backend,
    env,
    stdio: 'pipe',
  });
  execSync('npx tsx ../e2e/reset-db.ts', { cwd: backend, env, stdio: 'pipe' });
  execSync('npx tsx ../prisma/seed-demo.ts', { cwd: backend, env, stdio: 'pipe' });
}
