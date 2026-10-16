import { DateTime } from 'luxon';
import {
  auth,
  bookingPayload,
  createTestApp,
  futureDate,
  localInstant,
  nextPhone,
  Owner,
  registerOwner,
  resetDatabase,
  setupCatalog,
  TestContext,
} from './helpers';

const TZ = 'America/Tegucigalpa';

describe('Disponibilidad y reservas', () => {
  let ctx: TestContext;
  let owner: Owner;
  let cat: { serviceId: string; staffIds: string[] };
  let day: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    owner = await registerOwner(ctx, { timezone: TZ });
    cat = await setupCatalog(ctx, owner);
    day = futureDate(3, TZ);
  });
  afterAll(() => ctx.app.close());

  const slotsFor = async (staffId?: string, date = day) => {
    const res = await ctx
      .http()
      .get(`/api/public/businesses/${owner.slug}/availability`)
      .query({ serviceId: cat.serviceId, from: date, ...(staffId ? { staffId } : {}) })
      .expect(200);
    return res.body[0].slots as { startsAt: string; staffIds: string[] }[];
  };

  it('calcula horarios disponibles según horario laboral y duración', async () => {
    const slots = await slotsFor(cat.staffIds[0]);
    const local = slots.map((s) => DateTime.fromISO(s.startsAt, { zone: TZ }).toFormat('HH:mm'));
    expect(local[0]).toBe('09:00');
    expect(local[local.length - 1]).toBe('17:30'); // 30 min antes del cierre
    expect(local).toHaveLength(35); // paso de 15 min de 09:00 a 17:30 inclusive
    // La respuesta pública no contiene datos de otros clientes.
    expect(Object.keys(slots[0]).sort()).toEqual(['endsAt', 'staffIds', 'startsAt']);
  });

  it('reserva pública sin cuenta y devuelve un enlace de gestión', async () => {
    const startsAt = localInstant(day, '10:00', TZ);
    const res = await ctx
      .http()
      .post(`/api/public/businesses/${owner.slug}/appointments`)
      .send(
        bookingPayload(cat.serviceId, startsAt, {
          staffId: cat.staffIds[0],
          customerPhone: '9988-7766',
          phoneCountry: 'HN',
        }),
      )
      .expect(201);
    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body.manageToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.body.price).toBe('250.00');
    expect(res.body.currency).toBe('HNL');

    const appt = await ctx.prisma.appointment.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { customer: true },
    });
    expect(appt.customer!.phoneE164).toBe('+50499887766');
    expect(appt.manageTokenHash).not.toBe(res.body.manageToken); // solo se guarda el hash
    expect(appt.startsAt.toISOString()).toBe(new Date(startsAt).toISOString());

    // El horario deja de ofrecerse.
    const slots = await slotsFor(cat.staffIds[0]);
    expect(slots.find((s) => s.startsAt === new Date(startsAt).toISOString())).toBeUndefined();

    const notif = await ctx.prisma.notification.findMany({ where: { appointmentId: appt.id } });
    expect(notif.map((n) => `${n.channel}:${n.event}`).sort()).toEqual([
      'EMAIL:BOOKING_CONFIRMED',
      'WHATSAPP:BOOKING_CONFIRMED',
    ]);
  });

  it('rechaza teléfonos inválidos, horarios fuera de agenda y bots', async () => {
    const startsAt = localInstant(day, '10:00', TZ);
    const bad = await ctx
      .http()
      .post(`/api/public/businesses/${owner.slug}/appointments`)
      .send(bookingPayload(cat.serviceId, startsAt, { customerPhone: '123456789' }))
      .expect(400);
    expect(bad.body.error.code).toBe('INVALID_PHONE');
    const off = await ctx
      .http()
      .post(`/api/public/businesses/${owner.slug}/appointments`)
      .send(
        bookingPayload(cat.serviceId, localInstant(day, '20:00', TZ), { staffId: cat.staffIds[0] }),
      )
      .expect(409);
    expect(off.body.error.code).toBe('SLOT_UNAVAILABLE');
    await ctx
      .http()
      .post(`/api/public/businesses/${owner.slug}/appointments`)
      .send(bookingPayload(cat.serviceId, startsAt, { website: 'http://spam' }))
      .expect(400);
    await ctx
      .http()
      .post(`/api/public/businesses/${owner.slug}/appointments`)
      .send(bookingPayload(cat.serviceId, new Date(Date.now() + 10 * 60_000).toISOString()))
      .expect(409); // antelación mínima
  });

  it('limita reservas activas por teléfono', async () => {
    const phone = nextPhone();
    for (const hhmm of ['09:00', '10:00', '11:00']) {
      await ctx
        .http()
        .post(`/api/public/businesses/${owner.slug}/appointments`)
        .send(bookingPayload(cat.serviceId, localInstant(day, hhmm, TZ), { customerPhone: phone }))
        .expect(201);
    }
    const res = await ctx
      .http()
      .post(`/api/public/businesses/${owner.slug}/appointments`)
      .send(bookingPayload(cat.serviceId, localInstant(day, '12:00', TZ), { customerPhone: phone }))
      .expect(429);
    expect(res.body.error.code).toBe('TOO_MANY_ACTIVE_BOOKINGS');
  });

  it('dos o más clientes reservando el mismo horario: solo uno lo consigue', async () => {
    const startsAt = localInstant(day, '11:00', TZ);
    const attempts = await Promise.all(
      Array.from({ length: 12 }, () =>
        ctx
          .http()
          .post(`/api/public/businesses/${owner.slug}/appointments`)
          .send(
            bookingPayload(cat.serviceId, startsAt, {
              staffId: cat.staffIds[0],
              customerPhone: nextPhone(),
            }),
          ),
      ),
    );
    const statuses = attempts.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(11);
    const count = await ctx.prisma.appointment.count({
      where: { staffId: cat.staffIds[0], status: 'CONFIRMED' },
    });
    expect(count).toBe(1);
  });

  it('la restricción de exclusión impide solapamientos aunque se omita la validación de la API', async () => {
    const staff = await ctx.prisma.staff.findUniqueOrThrow({ where: { id: cat.staffIds[0] } });
    const base = new Date(localInstant(day, '14:00', TZ));
    const mk = (offsetMin: number, len: number) =>
      ctx.prisma.appointment.create({
        data: {
          businessId: owner.businessId,
          branchId: staff.branchId,
          staffId: staff.id,
          type: 'BLOCKED',
          blockReason: 'OTHER',
          startsAt: new Date(base.getTime() + offsetMin * 60_000),
          endsAt: new Date(base.getTime() + (offsetMin + len) * 60_000),
        },
      });
    // Todos los intervalos comparten 00:30–00:40: solo uno puede insertarse.
    const results = await Promise.allSettled([mk(0, 60), mk(15, 30), mk(30, 60), mk(20, 20)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(String(rejected.reason)).toMatch(/23P01|no_overlap|exclusion/i);
    // Una cita cancelada libera el intervalo.
    await ctx.prisma.appointment.updateMany({
      where: { staffId: staff.id },
      data: { status: 'CANCELED' },
    });
    await expect(mk(0, 60)).resolves.toBeTruthy();
    // Contiguo (empieza cuando termina el otro) sí está permitido; un minuto de solape no.
    await expect(mk(60, 30)).resolves.toBeTruthy();
    await expect(mk(89, 10)).rejects.toThrow();
  });

  it('"cualquier profesional" asigna otro profesional cuando uno está ocupado', async () => {
    const owner2 = await registerOwner(ctx, { timezone: TZ });
    const cat2 = await setupCatalog(ctx, owner2, { staffCount: 2 });
    const startsAt = localInstant(day, '15:00', TZ);
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        ctx
          .http()
          .post(`/api/public/businesses/${owner2.slug}/appointments`)
          .send(bookingPayload(cat2.serviceId, startsAt, { customerPhone: nextPhone() })),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 409]);
    const staffIds = results
      .filter((r) => r.status === 201)
      .map((r) => r.body.staff.id)
      .sort();
    expect(staffIds).toEqual([...cat2.staffIds].sort());
  });

  it('bloqueos rápidos y walk-ins ocupan la agenda sin datos de cliente', async () => {
    const block = await ctx
      .http()
      .post(`/api/businesses/${owner.businessId}/appointments/blocks`)
      .set(auth(owner.token))
      .send({
        staffId: cat.staffIds[0],
        startsAt: localInstant(day, '12:00', TZ),
        durationMinutes: 60,
        reason: 'BREAK',
      })
      .expect(201);
    expect(block.body.type).toBe('BLOCKED');
    expect(block.body.customer).toBeNull();
    expect(block.body.price).toBeNull();

    const walkIn = await ctx
      .http()
      .post(`/api/businesses/${owner.businessId}/appointments/walk-ins`)
      .set(auth(owner.token))
      .send({
        staffId: cat.staffIds[0],
        serviceId: cat.serviceId,
        startsAt: localInstant(day, '13:00', TZ),
      })
      .expect(201);
    expect(walkIn.body.type).toBe('WALK_IN');
    expect(walkIn.body.customer).toBeNull();
    expect(walkIn.body.price).toBe('250.00');

    const slots = (await slotsFor(cat.staffIds[0])).map((s) =>
      DateTime.fromISO(s.startsAt, { zone: TZ }).toFormat('HH:mm'),
    );
    expect(slots).not.toContain('12:00');
    expect(slots).not.toContain('12:45');
    expect(slots).not.toContain('13:00');
    expect(slots).toContain('11:30');
    expect(slots).toContain('13:30');

    // Un bloqueo encima de un walk-in existente se rechaza.
    const overlap = await ctx
      .http()
      .post(`/api/businesses/${owner.businessId}/appointments/blocks`)
      .set(auth(owner.token))
      .send({
        staffId: cat.staffIds[0],
        startsAt: localInstant(day, '13:15', TZ),
        durationMinutes: 15,
        reason: 'ABSENCE',
      })
      .expect(409);
    expect(overlap.body.error.code).toBe('SLOT_UNAVAILABLE');

    const agenda = await ctx
      .http()
      .get(`/api/businesses/${owner.businessId}/appointments`)
      .set(auth(owner.token))
      .query({ from: localInstant(day, '00:00', TZ), to: localInstant(day, '23:59', TZ) })
      .expect(200);
    expect(agenda.body.map((a: { type: string }) => a.type)).toEqual(['BLOCKED', 'WALK_IN']);
  });

  it('descansos, días libres, excepciones y vacaciones reducen la disponibilidad', async () => {
    const staffId = cat.staffIds[0];
    const weekday = DateTime.fromISO(day, { zone: TZ }).weekday;
    await ctx
      .http()
      .put(`/api/businesses/${owner.businessId}/staff/${staffId}/schedule`)
      .set(auth(owner.token))
      .send({
        workingHours: [{ weekday, startMinute: 540, endMinute: 720 }],
        breaks: [{ weekday, startMinute: 600, endMinute: 630, label: 'Café' }],
      })
      .expect(200);
    let local = (await slotsFor(staffId)).map((s) =>
      DateTime.fromISO(s.startsAt, { zone: TZ }).toFormat('HH:mm'),
    );
    expect(local).not.toContain('09:45'); // terminaría dentro del descanso
    expect(local).not.toContain('10:00');
    expect(local).toContain('10:30');

    // Otro día de la semana es libre.
    expect(await slotsFor(staffId, futureDate(4, TZ))).toEqual([]);

    // Excepción: ese día solo de 15:00 a 16:00.
    await ctx
      .http()
      .post(`/api/businesses/${owner.businessId}/staff/${staffId}/exceptions`)
      .set(auth(owner.token))
      .send({ date: day, isClosed: false, startMinute: 900, endMinute: 960 })
      .expect(201);
    local = (await slotsFor(staffId)).map((s) =>
      DateTime.fromISO(s.startsAt, { zone: TZ }).toFormat('HH:mm'),
    );
    expect(local).toEqual(['15:00', '15:15', '15:30']);

    // Vacaciones que cubren el día.
    const res = await ctx
      .http()
      .post(`/api/businesses/${owner.businessId}/staff/${staffId}/time-off`)
      .set(auth(owner.token))
      .send({ type: 'VACATION', fromDate: day, toDate: day })
      .expect(201);
    expect(res.body.conflictingAppointments).toBe(0);
    expect(await slotsFor(staffId)).toEqual([]);
  });

  describe('gestión por enlace seguro', () => {
    const book = async (hhmm: string) =>
      (
        await ctx
          .http()
          .post(`/api/public/businesses/${owner.slug}/appointments`)
          .send(
            bookingPayload(cat.serviceId, localInstant(day, hhmm, TZ), {
              staffId: cat.staffIds[0],
              customerPhone: nextPhone(),
            }),
          )
          .expect(201)
      ).body;

    it('el cliente cancela con su enlace y el horario se libera', async () => {
      const b = await book('10:00');
      const view = await ctx.http().get(`/api/public/manage/${b.manageToken}`).expect(200);
      expect(view.body.canCancel).toBe(true);
      const res = await ctx
        .http()
        .post(`/api/public/manage/${b.manageToken}/cancel`)
        .send({ reason: 'Imprevisto' })
        .expect(200);
      expect(res.body.status).toBe('CANCELED');
      await ctx.http().post(`/api/public/manage/${b.manageToken}/cancel`).send({}).expect(409);
      const slots = await slotsFor(cat.staffIds[0]);
      expect(slots.some((s) => s.startsAt === b.startsAt)).toBe(true);
    });

    it('el cliente reprograma a un horario libre y no a uno ocupado', async () => {
      const b = await book('10:00');
      const other = await book('11:00');
      const busy = await ctx
        .http()
        .post(`/api/public/manage/${b.manageToken}/reschedule`)
        .send({ startsAt: other.startsAt })
        .expect(409);
      expect(busy.body.error.code).toBe('SLOT_UNAVAILABLE');
      // Mover 15 min solapando su propio horario actual sí está permitido.
      const target = localInstant(day, '10:15', TZ);
      const res = await ctx
        .http()
        .post(`/api/public/manage/${b.manageToken}/reschedule`)
        .send({ startsAt: target })
        .expect(200);
      expect(res.body.startsAt).toBe(new Date(target).toISOString());
      const appt = await ctx.prisma.appointment.findUniqueOrThrow({ where: { id: b.id } });
      expect(appt.rescheduleCount).toBe(1);
      expect(appt.endsAt.getTime() - appt.startsAt.getTime()).toBe(30 * 60_000);
    });

    it('no permite cancelar dentro de la ventana mínima y no revela tokens inválidos', async () => {
      const b = await book('10:00');
      await ctx.prisma.business.update({
        where: { id: owner.businessId },
        data: { cancelWindowMinutes: 10 * 24 * 60 },
      });
      const res = await ctx
        .http()
        .post(`/api/public/manage/${b.manageToken}/cancel`)
        .send({})
        .expect(409);
      expect(res.body.error.code).toBe('CANCEL_NOT_ALLOWED');
      await ctx.http().get('/api/public/manage/abc').expect(404);
      await ctx
        .http()
        .get(`/api/public/manage/${'A'.repeat(43)}`)
        .expect(404);
      // Token caducado: misma respuesta que inexistente.
      await ctx.prisma.appointment.update({
        where: { id: b.id },
        data: { manageTokenExpiresAt: new Date(Date.now() - 1000) },
      });
      await ctx.http().get(`/api/public/manage/${b.manageToken}`).expect(404);
    });

    it('el administrador cancela, reprograma, completa y marca inasistencia', async () => {
      const b1 = await book('09:00');
      const b2 = await book('09:30');
      const base = `/api/businesses/${owner.businessId}/appointments`;
      const moved = await ctx
        .http()
        .post(`${base}/${b1.id}/reschedule`)
        .set(auth(owner.token))
        .send({ startsAt: localInstant(day, '16:00', TZ) })
        .expect(200);
      expect(DateTime.fromISO(moved.body.startsAt, { zone: TZ }).toFormat('HH:mm')).toBe('16:00');
      await ctx
        .http()
        .post(`${base}/${b2.id}/cancel`)
        .set(auth(owner.token))
        .send({ reason: 'Cierre' })
        .expect(200);
      // No se puede completar una cita futura.
      const early = await ctx
        .http()
        .post(`${base}/${b1.id}/complete`)
        .set(auth(owner.token))
        .expect(409);
      expect(early.body.error.code).toBe('APPOINTMENT_NOT_STARTED');
      await ctx.prisma.appointment.update({
        where: { id: b1.id },
        data: {
          startsAt: new Date(Date.now() - 2 * 3_600_000),
          endsAt: new Date(Date.now() - 1.5 * 3_600_000),
        },
      });
      const done = await ctx
        .http()
        .post(`${base}/${b1.id}/complete`)
        .set(auth(owner.token))
        .expect(200);
      expect(done.body.status).toBe('COMPLETED');
      expect(done.body.feedbackUrl).toMatch(/\/f\/[A-Za-z0-9_-]{43}$/);
      await ctx.http().post(`${base}/${b1.id}/no-show`).set(auth(owner.token)).expect(409);
    });
  });
});

describe('Zonas horarias', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
  });
  afterAll(() => ctx.app.close());

  it.each(['America/Mexico_City', 'America/Sao_Paulo', 'Europe/Madrid', 'Asia/Tokyo'])(
    'las 09:00 locales de %s se guardan como el instante UTC correcto',
    async (tz) => {
      const owner = await registerOwner(ctx, { timezone: tz });
      const cat = await setupCatalog(ctx, owner);
      const day = futureDate(5, tz);
      const res = await ctx
        .http()
        .get(`/api/public/businesses/${owner.slug}/availability`)
        .query({ serviceId: cat.serviceId, from: day })
        .expect(200);
      const first = res.body[0].slots[0].startsAt as string;
      expect(DateTime.fromISO(first, { zone: tz }).toFormat('yyyy-MM-dd HH:mm')).toBe(
        `${day} 09:00`,
      );
      const booked = await ctx
        .http()
        .post(`/api/public/businesses/${owner.slug}/appointments`)
        .send(bookingPayload(cat.serviceId, first, { customerPhone: nextPhone() }))
        .expect(201);
      const appt = await ctx.prisma.appointment.findUniqueOrThrow({
        where: { id: booked.body.id },
      });
      expect(appt.startsAt.toISOString()).toBe(first);
      expect(booked.body.timezone).toBe(tz);
    },
  );

  it('la sucursal puede tener una zona distinta a la del negocio', async () => {
    const owner = await registerOwner(ctx, { timezone: 'America/Bogota' });
    const cat = await setupCatalog(ctx, owner);
    const branch = await ctx.prisma.branch.findFirstOrThrow({
      where: { businessId: owner.businessId },
    });
    await ctx.prisma.branch.update({
      where: { id: branch.id },
      data: { timezone: 'America/Lima' },
    });
    const day = futureDate(5, 'America/Lima');
    const res = await ctx
      .http()
      .get(`/api/public/businesses/${owner.slug}/availability`)
      .query({ serviceId: cat.serviceId, from: day })
      .expect(200);
    expect(
      DateTime.fromISO(res.body[0].slots[0].startsAt, { zone: 'America/Lima' }).toFormat('HH:mm'),
    ).toBe('09:00');
  });
});
