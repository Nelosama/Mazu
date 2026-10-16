import { auth, createTestApp, registerOwner, resetDatabase, setupCatalog, TestContext } from './helpers';

describe('Auth, registro de negocios y aislamiento multi-tenant', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => resetDatabase(ctx.prisma));
  afterAll(() => ctx.app.close());

  it('registra un negocio con dueño, sucursal principal y suscripción', async () => {
    const owner = await registerOwner(ctx, { timezone: 'America/Mexico_City', country: 'MX', currency: 'MXN' });
    const res = await ctx.http().get(`/api/businesses/${owner.businessId}`).set(auth(owner.token)).expect(200);
    expect(res.body.currency).toBe('MXN');
    expect(res.body.timezone).toBe('America/Mexico_City');
    expect(res.body.branches).toHaveLength(1);
    expect(res.body.subscription.plan.code).toBe('PRO');
    const membership = await ctx.prisma.businessMembership.findFirstOrThrow({ where: { businessId: owner.businessId } });
    expect(membership.role).toBe('OWNER');
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: owner.userId } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rechaza datos regionales inválidos', async () => {
    const res = await ctx
      .http()
      .post('/api/auth/register')
      .send({
        name: 'X Y',
        email: 'bad@test.dev',
        password: 'contraseña-segura-123',
        business: { name: 'Mal', type: 'SPA', country: 'ZZ', currency: 'XXXX', timezone: 'Mars/Base', locale: 'fr' },
      })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza correos duplicados y credenciales incorrectas', async () => {
    const owner = await registerOwner(ctx);
    await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: owner.email, password: 'incorrecta-123456' })
      .expect(401);
    const ok = await ctx.http().post('/api/auth/login').send({ email: owner.email, password: 'contraseña-segura-123' }).expect(200);
    expect(ok.body.accessToken).toBeTruthy();
    expect(ok.headers['set-cookie'][0]).toMatch(/bk_rt=.*HttpOnly/);
  });

  it('rota el refresh token y detecta su reutilización', async () => {
    const owner = await registerOwner(ctx);
    const login = await ctx.http().post('/api/auth/login').send({ email: owner.email, password: 'contraseña-segura-123' }).expect(200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const first = await ctx.http().post('/api/auth/refresh').set('Cookie', cookie).expect(200);
    const rotated = first.headers['set-cookie'][0].split(';')[0];
    expect(rotated).not.toBe(cookie);
    // Reutilizar el token ya rotado revoca toda la familia.
    await ctx.http().post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    await ctx.http().post('/api/auth/refresh').set('Cookie', rotated).expect(401);
  });

  it('exige autenticación en rutas privadas', async () => {
    const owner = await registerOwner(ctx);
    await ctx.http().get(`/api/businesses/${owner.businessId}/staff`).expect(401);
    await ctx.http().get(`/api/businesses/${owner.businessId}/staff`).set(auth('token-falso')).expect(401);
  });

  it('aísla los datos entre negocios', async () => {
    const a = await registerOwner(ctx);
    const b = await registerOwner(ctx);
    const catA = await setupCatalog(ctx, a);

    // B no puede leer ni modificar recursos de A, ni siquiera conociendo los IDs.
    await ctx.http().get(`/api/businesses/${a.businessId}`).set(auth(b.token)).expect(404);
    await ctx.http().get(`/api/businesses/${a.businessId}/staff`).set(auth(b.token)).expect(404);
    await ctx.http().get(`/api/businesses/${a.businessId}/appointments?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z`).set(auth(b.token)).expect(404);
    await ctx.http().patch(`/api/businesses/${a.businessId}/services/${catA.serviceId}`).set(auth(b.token)).send({ name: 'Hack' }).expect(404);

    // B usa su propio tenant pero apunta a IDs de A: el recurso no existe en su negocio.
    await ctx.http().patch(`/api/businesses/${b.businessId}/services/${catA.serviceId}`).set(auth(b.token)).send({ name: 'Hack' }).expect(404);
    await ctx.http().get(`/api/businesses/${b.businessId}/staff/${catA.staffIds[0]}`).set(auth(b.token)).expect(404);
    const assign = await ctx
      .http()
      .post(`/api/businesses/${b.businessId}/services`)
      .set(auth(b.token))
      .send({ name: 'Servicio B', price: '10', durationMinutes: 30, staffIds: catA.staffIds })
      .expect(400);
    expect(assign.body.error.code).toBe('STAFF_NOT_IN_BUSINESS');
    await ctx
      .http()
      .post(`/api/businesses/${b.businessId}/appointments/blocks`)
      .set(auth(b.token))
      .send({ staffId: catA.staffIds[0], startsAt: new Date().toISOString(), durationMinutes: 30, reason: 'BREAK' })
      .expect(404);

    const svc = await ctx.prisma.service.findUniqueOrThrow({ where: { id: catA.serviceId } });
    expect(svc.name).toBe('Corte clásico');
  });

  it('la base de datos rechaza referencias cruzadas entre negocios', async () => {
    const a = await registerOwner(ctx);
    const b = await registerOwner(ctx);
    const catA = await setupCatalog(ctx, a);
    const svcB = await ctx.prisma.service.create({ data: { businessId: b.businessId, name: 'B', price: 1, durationMinutes: 30 } });
    // Asociar el profesional de A con un servicio de B viola la FK compuesta (id, businessId).
    await expect(
      ctx.prisma.staffService.create({ data: { businessId: b.businessId, staffId: catA.staffIds[0], serviceId: svcB.id } }),
    ).rejects.toThrow();
    await expect(
      ctx.prisma.staffService.create({ data: { businessId: a.businessId, staffId: catA.staffIds[0], serviceId: svcB.id } }),
    ).rejects.toThrow();
  });

  it('permite que un usuario pertenezca a varios negocios', async () => {
    const owner = await registerOwner(ctx);
    const second = await ctx
      .http()
      .post('/api/businesses')
      .set(auth(owner.token))
      .send({ name: 'Segundo Spa', type: 'SPA', country: 'CO', currency: 'COP', timezone: 'America/Bogota', locale: 'es' })
      .expect(201);
    const me = await ctx.http().get('/api/auth/me').set(auth(owner.token)).expect(200);
    expect(me.body.memberships.map((m: { business: { id: string } }) => m.business.id).sort()).toEqual(
      [owner.businessId, second.body.id].sort(),
    );
    expect(me.body.isPlatformAdmin).toBe(false);
  });

  describe('permisos por rol', () => {
    it('STAFF puede ver la agenda pero no gestionar catálogo, equipo ni encuestas', async () => {
      const owner = await registerOwner(ctx);
      const cat = await setupCatalog(ctx, owner, { staffCount: 2 });
      await ctx
        .http()
        .post(`/api/businesses/${owner.businessId}/members`)
        .set(auth(owner.token))
        .send({ email: 'staff@test.dev', name: 'Barbero', password: 'clave-del-staff-1', role: 'STAFF', staffId: cat.staffIds[0] })
        .expect(201);
      const login = await ctx.http().post('/api/auth/login').send({ email: 'staff@test.dev', password: 'clave-del-staff-1' }).expect(200);
      const t = login.body.accessToken;

      await ctx.http().get(`/api/businesses/${owner.businessId}/staff`).set(auth(t)).expect(200);
      await ctx.http().post(`/api/businesses/${owner.businessId}/services`).set(auth(t)).send({ name: 'X', price: '1', durationMinutes: 30 }).expect(403);
      await ctx.http().patch(`/api/businesses/${owner.businessId}`).set(auth(t)).send({ name: 'Otro' }).expect(403);
      await ctx.http().get(`/api/businesses/${owner.businessId}/members`).set(auth(t)).expect(403);
      await ctx.http().get(`/api/businesses/${owner.businessId}/feedback/dashboard`).set(auth(t)).expect(403);

      // Puede bloquear su propio tiempo, pero no el de otro profesional.
      const start = new Date(Date.now() + 86_400_000).toISOString();
      await ctx.http().post(`/api/businesses/${owner.businessId}/appointments/blocks`).set(auth(t))
        .send({ staffId: cat.staffIds[0], startsAt: start, durationMinutes: 30, reason: 'BREAK' }).expect(201);
      await ctx.http().post(`/api/businesses/${owner.businessId}/appointments/blocks`).set(auth(t))
        .send({ staffId: cat.staffIds[1], startsAt: start, durationMinutes: 30, reason: 'BREAK' }).expect(403);
    });

    it('ADMIN no puede crear OWNERs y no se puede degradar al último OWNER', async () => {
      const owner = await registerOwner(ctx);
      await ctx.http().post(`/api/businesses/${owner.businessId}/members`).set(auth(owner.token))
        .send({ email: 'admin@test.dev', name: 'Admin', password: 'clave-del-admin-1', role: 'ADMIN' }).expect(201);
      const t = (await ctx.http().post('/api/auth/login').send({ email: 'admin@test.dev', password: 'clave-del-admin-1' })).body.accessToken;
      await ctx.http().post(`/api/businesses/${owner.businessId}/members`).set(auth(t))
        .send({ email: 'otro@test.dev', name: 'Otro', password: 'clave-del-otro-12', role: 'OWNER' }).expect(403);
      const members = await ctx.http().get(`/api/businesses/${owner.businessId}/members`).set(auth(owner.token)).expect(200);
      const ownerMember = members.body.find((m: { role: string }) => m.role === 'OWNER');
      const res = await ctx.http().patch(`/api/businesses/${owner.businessId}/members/${ownerMember.id}`).set(auth(owner.token))
        .send({ role: 'ADMIN' }).expect(409);
      expect(res.body.error.code).toBe('LAST_OWNER');
    });

    it('un negocio suspendido queda en solo lectura', async () => {
      const owner = await registerOwner(ctx);
      await ctx.prisma.business.update({ where: { id: owner.businessId }, data: { status: 'SUSPENDED' } });
      await ctx.http().get(`/api/businesses/${owner.businessId}/staff`).set(auth(owner.token)).expect(200);
      const res = await ctx.http().post(`/api/businesses/${owner.businessId}/staff`).set(auth(owner.token)).send({ name: 'Nuevo' }).expect(403);
      expect(res.body.error.code).toBe('BUSINESS_SUSPENDED');
      await ctx.http().get(`/api/public/businesses/${owner.slug}`).expect(404);
    });
  });
});
