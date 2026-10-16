import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const tables = await prisma.$queryRaw<{ tablename: string }[]>`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'Plan')`;
if (!/e2e/.test(process.env.DATABASE_URL ?? '')) throw new Error('Solo base de datos E2E');
await prisma.$executeRawUnsafe(
  `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`,
);
await prisma.$disconnect();
