/**
 * Concede el rol de plataforma SUPER_ADMIN a un usuario existente.
 * Uso: npm run admin:grant -w backend -- correo@ejemplo.com
 * Es la ÚNICA vía para crear Super Admins: no existe endpoint HTTP para ello.
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error('Indica el correo del usuario');
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`No existe el usuario ${email}`);
    await prisma.platformAdmin.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'platform.grant_super_admin',
        metadata: { via: 'cli' },
      },
    });
    console.warn(`✔ ${email} ahora es SUPER_ADMIN`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
