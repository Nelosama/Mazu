import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetEnvCache } from '../src/config/env';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestContext> {
  resetEnvCache();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ bodyParser: false });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, http: () => request(app.getHttpServer()) };
}

/** Vacía todas las tablas de datos (conserva los planes sembrados por migración). */
export async function resetDatabase(prisma: PrismaService) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'Plan')`;
  if (!tables.length) return;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

let seq = 0;
export const uniq = (prefix = 'x') => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

export interface Owner {
  token: string;
  businessId: string;
  userId: string;
  email: string;
  slug: string;
}

export async function registerOwner(
  ctx: TestContext,
  overrides: { timezone?: string; country?: string; currency?: string; locale?: string; name?: string } = {},
): Promise<Owner> {
  const email = `${uniq('owner')}@test.dev`;
  const res = await ctx
    .http()
    .post('/api/auth/register')
    .send({
      name: 'Dueña Prueba',
      email,
      password: 'contraseña-segura-123',
      business: {
        name: overrides.name ?? `Negocio ${uniq()}`,
        type: 'BARBERSHOP',
        country: overrides.country ?? 'HN',
        currency: overrides.currency ?? 'HNL',
        timezone: overrides.timezone ?? 'America/Tegucigalpa',
        locale: overrides.locale ?? 'es',
      },
    })
    .expect(201);
  const b = await ctx.prisma.business.findUniqueOrThrow({ where: { id: res.body.businessId } });
  return { token: res.body.accessToken, businessId: res.body.businessId, userId: res.body.user.id, email, slug: b.slug };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Crea un profesional con horario 09:00–18:00 todos los días y un servicio de 30 min. */
export async function setupCatalog(ctx: TestContext, owner: Owner, opts: { duration?: number; staffCount?: number } = {}) {
  const service = await ctx
    .http()
    .post(`/api/businesses/${owner.businessId}/services`)
    .set(auth(owner.token))
    .send({ name: 'Corte clásico', price: '250.00', durationMinutes: opts.duration ?? 30 })
    .expect(201);
  const staff: { id: string }[] = [];
  for (let i = 0; i < (opts.staffCount ?? 1); i++) {
    const s = await ctx
      .http()
      .post(`/api/businesses/${owner.businessId}/staff`)
      .set(auth(owner.token))
      .send({ name: `Profesional ${i + 1}`, serviceIds: [service.body.id] })
      .expect(201);
    await ctx
      .http()
      .put(`/api/businesses/${owner.businessId}/staff/${s.body.id}/schedule`)
      .set(auth(owner.token))
      .send({
        workingHours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1080 })),
        breaks: [],
      })
      .expect(200);
    staff.push(s.body);
  }
  return { serviceId: service.body.id as string, staffIds: staff.map((s) => s.id) };
}

/** Fecha local futura (en días) en la zona indicada. */
export function futureDate(days: number, timezone: string) {
  return DateTime.now().setZone(timezone).plus({ days }).toISODate()!;
}

export function localInstant(date: string, hhmm: string, timezone: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return DateTime.fromISO(date, { zone: timezone }).set({ hour: h, minute: m, second: 0, millisecond: 0 }).toUTC().toISO()!;
}

export function bookingPayload(serviceId: string, startsAt: string, extra: Record<string, unknown> = {}) {
  return {
    serviceId,
    startsAt,
    customerName: 'Cliente Prueba',
    customerPhone: '+50499887766',
    whatsappConsent: true,
    ...extra,
  };
}

let phoneSeq = 1000000;
/** Teléfono hondureño móvil válido y distinto en cada llamada. */
export const nextPhone = () => `+5049${(phoneSeq++).toString().padStart(7, '0')}`;
