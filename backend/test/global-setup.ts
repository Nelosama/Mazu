import { execSync } from 'node:child_process';
import { config } from 'dotenv';
import { resolve } from 'node:path';

export default async function globalSetup() {
  config({ path: resolve(__dirname, '../.env.test'), override: true, quiet: true });
  if (!/booking_test|_test\b|test/.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('Las pruebas de integración solo se ejecutan contra una base de datos de pruebas');
  }
  execSync('npx prisma migrate deploy --schema ../prisma/schema.prisma', {
    cwd: resolve(__dirname, '..'),
    stdio: 'pipe',
    env: process.env,
  });
}
