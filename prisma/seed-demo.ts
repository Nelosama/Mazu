/**
 * DATOS DE DEMOSTRACIÓN — solo para desarrollo, pruebas manuales y demos.
 * No forma parte del funcionamiento productivo y se niega a ejecutarse con NODE_ENV=production.
 *
 * Uso: npm run db:seed:demo
 * Crea el negocio "Barbería Nova" (/b/barberia-nova) con su equipo, servicios y horarios,
 * una cuenta dueña y una cuenta Super Admin de demostración.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-password-123';

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('El seed de demostración no se ejecuta en producción.');
  }
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.business.findUnique({ where: { slug: 'barberia-nova' } });
    if (existing) {
      console.warn('La demo ya existe (barberia-nova). Nada que hacer.');
      return;
    }
    const hash = await argon2.hash(DEMO_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    const plan = await prisma.plan.findUniqueOrThrow({ where: { code: 'PRO' } });

    await prisma.$transaction(async (tx) => {
      const owner = await tx.user.upsert({
        where: { email: 'demo.owner@example.com' },
        create: {
          name: 'Valeria Demo',
          email: 'demo.owner@example.com',
          passwordHash: hash,
          preferredLocale: 'es',
        },
        update: {},
      });
      const admin = await tx.user.upsert({
        where: { email: 'demo.superadmin@example.com' },
        create: { name: 'Operador Demo', email: 'demo.superadmin@example.com', passwordHash: hash },
        update: {},
      });
      await tx.platformAdmin.upsert({
        where: { userId: admin.id },
        create: { userId: admin.id },
        update: {},
      });

      const business = await tx.business.create({
        data: {
          name: 'Barbería Nova',
          slug: 'barberia-nova',
          type: 'BARBERSHOP',
          description:
            'Cortes clásicos y modernos, barba y cuidado masculino. [DATOS DE DEMOSTRACIÓN]',
          primaryColor: '#0F766E',
          country: 'HN',
          currency: 'HNL',
          locale: 'es',
          timezone: 'America/Tegucigalpa',
          minLeadMinutes: 30,
        },
      });
      const branch = await tx.branch.create({
        data: {
          businessId: business.id,
          name: 'Principal',
          address: 'Col. Palmira, Tegucigalpa',
          timezone: 'America/Tegucigalpa',
        },
      });
      await tx.businessMembership.create({
        data: { userId: owner.id, businessId: business.id, role: 'OWNER' },
      });
      await tx.subscription.create({
        data: { businessId: business.id, planId: plan.id, status: 'ACTIVE' },
      });

      const services = await Promise.all(
        [
          ['Corte clásico', 'Cortes', 250, 30],
          ['Corte + barba', 'Cortes', 380, 60],
          ['Arreglo de barba', 'Barba', 180, 30],
          ['Afeitado tradicional', 'Barba', 220, 45],
          ['Corte infantil', 'Cortes', 200, 30],
        ].map(([name, category, price, durationMinutes], i) =>
          tx.service.create({
            data: {
              businessId: business.id,
              name: name as string,
              category: category as string,
              price: new Prisma.Decimal(price as number),
              durationMinutes: durationMinutes as number,
              sortOrder: i,
            },
          }),
        ),
      );
      const staff = await Promise.all(
        [
          ['Carlos Mejía', 'Fade y diseño'],
          ['Andrea López', 'Barba y afeitado'],
          ['Luis Ramos', 'Cortes clásicos'],
        ].map(([name, specialty], i) =>
          tx.staff.create({
            data: { businessId: business.id, branchId: branch.id, name, specialty, sortOrder: i },
          }),
        ),
      );
      for (const s of staff) {
        await tx.staffService.createMany({
          data: services.map((sv) => ({
            businessId: business.id,
            staffId: s.id,
            serviceId: sv.id,
          })),
        });
        await tx.workingHours.createMany({
          data: [1, 2, 3, 4, 5, 6].map((weekday) => ({
            businessId: business.id,
            staffId: s.id,
            weekday,
            startMinute: 9 * 60,
            endMinute: 19 * 60,
          })),
        });
        await tx.recurringBreak.createMany({
          data: [1, 2, 3, 4, 5, 6].map((weekday) => ({
            businessId: business.id,
            staffId: s.id,
            weekday,
            startMinute: 13 * 60,
            endMinute: 14 * 60,
            label: 'Almuerzo',
          })),
        });
      }
    });
    console.warn('✔ Demo creada: /b/barberia-nova');
    console.warn(`  Dueña:       demo.owner@example.com / ${DEMO_PASSWORD}`);
    console.warn(`  Super Admin: demo.superadmin@example.com / ${DEMO_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
