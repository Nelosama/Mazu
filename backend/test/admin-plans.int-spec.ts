import { auth, bookingPayload, createTestApp, futureDate, localInstant, nextPhone, registerOwner, resetDatabase, setupCatalog, TestContext } from './helpers';
import { RetentionJob } from '../src/admin/retention.job';

describe('Super Admin y planes', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => resetDatabase(ctx.prisma));
  afterAll(() => ctx.app.close());

  const makeSuperAdmin = async () => {
    const admin = await registerOwner(ctx);
    await ctx.prisma.platformAdmin.create({ data: { userId: admin.userId } });
    return admin;
  };

  it('solo un PlatformAdmin accede al panel; un OWNER no puede autoasignarse el rol', async () => {
    const owner = await registerOwner(ctx);
    await ctx.http().get('/api/admin/metrics').set(auth(owner.token)).expect(403);
    // Intentos de escalar privilegios desde el tenant: campos desconocidos se rechazan.
    await ctx.http().post(`/api/businesses/${owner.businessId}/members`).set(auth(owner.token))
      .send({ email: owner.email, role: 'SUPER_ADMIN' }).expect(400);
    await ctx.http().patch(`/api/businesses/${owner.businessId}`).set(auth(owner.token)).send({ isPlatformAdmin: true }).expect(400);
    const admin = await makeSuperAdmin();
    const m = await ctx.http().get('/api/admin/metrics').set(auth(admin.token)).expect(200);
    expect(m.body.businesses.active).toBe(2);
  });

  it('lista negocios con métricas agregadas y sin datos personales de clientes', async () => {
    const admin = await makeSuperAdmin();
    const owner = await registerOwner(ctx);
    const cat = await setupCatalog(ctx, owner);
    await ctx.http().post(`/api/public/businesses/${owner.slug}/appointments`)
      .send(bookingPayload(cat.serviceId, localInstant(futureDate(2, 'America/Tegucigalpa'), '10:00', 'America/Tegucigalpa'), { customerPhone: '+50499112233', customerName: 'Persona Privada' }))
      .expect(201);
    const res = await ctx.http().get('/api/admin/businesses').set(auth(admin.token)).expect(200);
    const row = res.body.find((b: { id: string }) => b.id === owner.businessId);
    expect(row.activeStaff).toBe(1);
    expect(row.appointments30d).toBe(1);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('+50499112233');
    expect(raw).not.toContain('Persona Privada');
  });

  it('suspende y reactiva tenants con auditoría', async () => {
    const admin = await makeSuperAdmin();
    const owner = await registerOwner(ctx);
    await ctx.http().patch(`/api/admin/businesses/${owner.businessId}/status`).set(auth(admin.token))
      .send({ status: 'SUSPENDED', reason: 'Impago de prueba' }).expect(200);
    await ctx.http().get(`/api/public/businesses/${owner.slug}`).expect(404);
    await ctx.http().patch(`/api/admin/businesses/${owner.businessId}/status`).set(auth(admin.token))
      .send({ status: 'ACTIVE', reason: 'Regularizado' }).expect(200);
    await ctx.http().get(`/api/public/businesses/${owner.slug}`).expect(200);
    const logs = await ctx.prisma.auditLog.findMany({ where: { businessId: owner.businessId, action: { startsWith: 'admin.' } } });
    expect(logs.map((l) => l.action).sort()).toEqual(['admin.business_activate', 'admin.business_suspend']);
  });

  it('crea negocios desde el panel y administra planes', async () => {
    const admin = await makeSuperAdmin();
    const created = await ctx.http().post('/api/admin/businesses').set(auth(admin.token)).send({
      owner: { name: 'Nueva Dueña', email: 'nueva@test.dev' },
      business: { name: 'Uñas Bonitas', type: 'NAIL_STUDIO', country: 'PE', currency: 'PEN', timezone: 'America/Lima', locale: 'es' },
      planCode: 'STARTER',
    }).expect(201);
    expect(created.body.temporaryPassword).toBeTruthy();
    await ctx.http().post('/api/auth/login').send({ email: 'nueva@test.dev', password: created.body.temporaryPassword }).expect(200);

    const plans = await ctx.http().get('/api/admin/plans').set(auth(admin.token)).expect(200);
    const pro = plans.body.find((p: { code: string }) => p.code === 'PRO');
    const upd = await ctx.http().patch(`/api/admin/plans/${pro.id}`).set(auth(admin.token)).send({ monthlyPrice: '29.90', maxStaff: 5 }).expect(200);
    expect(upd.body.monthlyPrice).toBe('29.90');
    await ctx.http().patch(`/api/admin/businesses/${created.body.business.id}/subscription`).set(auth(admin.token))
      .send({ planCode: 'BUSINESS', status: 'ACTIVE' }).expect(200);
  });

  it('acceso de soporte a datos personales solo con autorización del OWNER y auditado', async () => {
    const admin = await makeSuperAdmin();
    const owner = await registerOwner(ctx);
    await ctx.http().post(`/api/admin/businesses/${owner.businessId}/support/appointments`).set(auth(admin.token))
      .send({ reason: 'Ticket 123' }).expect(403);
    await ctx.http().post(`/api/businesses/${owner.businessId}/support-grants`).set(auth(owner.token))
      .send({ reason: 'Revisar reservas duplicadas', hours: 2 }).expect(201);
    await ctx.http().post(`/api/admin/businesses/${owner.businessId}/support/appointments`).set(auth(admin.token))
      .send({ reason: 'Ticket 123' }).expect(200);
    const log = await ctx.prisma.auditLog.findFirst({ where: { action: 'admin.support_access', businessId: owner.businessId } });
    expect(log?.actorUserId).toBe(admin.userId);
  });

  it('aplica límites del plan STARTER', async () => {
    const owner = await registerOwner(ctx);
    const starter = await ctx.prisma.plan.findUniqueOrThrow({ where: { code: 'STARTER' } });
    await ctx.prisma.subscription.update({ where: { businessId: owner.businessId }, data: { planId: starter.id } });
    await ctx.http().post(`/api/businesses/${owner.businessId}/staff`).set(auth(owner.token)).send({ name: 'Uno' }).expect(201);
    const res = await ctx.http().post(`/api/businesses/${owner.businessId}/staff`).set(auth(owner.token)).send({ name: 'Dos' }).expect(403);
    expect(res.body.error.code).toBe('PLAN_LIMIT_STAFF');
    await ctx.http().patch(`/api/businesses/${owner.businessId}`).set(auth(owner.token)).send({ primaryColor: '#FF0000' }).expect(403);
    await ctx.http().post(`/api/businesses/${owner.businessId}/branches`).set(auth(owner.token)).send({ name: 'Segunda' }).expect(403);
  });

  it('aplica el límite mensual de reservas', async () => {
    const owner = await registerOwner(ctx);
    const cat = await setupCatalog(ctx, owner);
    await ctx.prisma.plan.update({ where: { code: 'PRO' }, data: { maxMonthlyBookings: 1 } });
    try {
      const day = futureDate(2, 'America/Tegucigalpa');
      await ctx.http().post(`/api/public/businesses/${owner.slug}/appointments`)
        .send(bookingPayload(cat.serviceId, localInstant(day, '10:00', 'America/Tegucigalpa'), { customerPhone: nextPhone() })).expect(201);
      const res = await ctx.http().post(`/api/public/businesses/${owner.slug}/appointments`)
        .send(bookingPayload(cat.serviceId, localInstant(day, '11:00', 'America/Tegucigalpa'), { customerPhone: nextPhone() })).expect(403);
      expect(res.body.error.code).toBe('PLAN_LIMIT_BOOKINGS');
    } finally {
      await ctx.prisma.plan.update({ where: { code: 'PRO' }, data: { maxMonthlyBookings: null } });
    }
  });

  it('la política de retención anonimiza clientes antiguos', async () => {
    const owner = await registerOwner(ctx);
    const cat = await setupCatalog(ctx, owner);
    const b = await ctx.http().post(`/api/public/businesses/${owner.slug}/appointments`)
      .send(bookingPayload(cat.serviceId, localInstant(futureDate(2, 'America/Tegucigalpa'), '10:00', 'America/Tegucigalpa'), { customerPhone: nextPhone() }))
      .expect(201);
    const old = new Date();
    old.setFullYear(old.getFullYear() - 3);
    await ctx.prisma.appointment.update({ where: { id: b.body.id }, data: { startsAt: old, endsAt: new Date(old.getTime() + 1_800_000), status: 'COMPLETED' } });
    const result = await ctx.app.get(RetentionJob).purge();
    expect(result.anonymizedCustomers).toBe(1);
    const appt = await ctx.prisma.appointment.findUniqueOrThrow({ where: { id: b.body.id } });
    expect(appt.customerId).toBeNull();
    expect(await ctx.prisma.customer.count()).toBe(0);
  });
});
