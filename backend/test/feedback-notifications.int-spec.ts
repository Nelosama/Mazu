import sharp from 'sharp';
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
import { NotificationsService } from '../src/notifications/notifications.service';
import { NotificationProvider, OutgoingMessage } from '../src/notifications/providers/provider';

const TZ = 'America/Tegucigalpa';

describe('Encuestas de satisfacción', () => {
  let ctx: TestContext;
  let owner: Owner;
  let cat: { serviceId: string; staffIds: string[] };

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    owner = await registerOwner(ctx, { timezone: TZ });
    cat = await setupCatalog(ctx, owner);
  });
  afterAll(() => ctx.app.close());

  /** Walk-in en el pasado, completado → enlace de encuesta. */
  const completedVisit = async (minutesAgo = 120) => {
    const walkIn = await ctx
      .http()
      .post(`/api/businesses/${owner.businessId}/appointments/walk-ins`)
      .set(auth(owner.token))
      .send({
        staffId: cat.staffIds[0],
        serviceId: cat.serviceId,
        startsAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      })
      .expect(201);
    const done = await ctx
      .http()
      .post(`/api/businesses/${owner.businessId}/appointments/${walkIn.body.id}/complete`)
      .set(auth(owner.token))
      .expect(200);
    return {
      id: walkIn.body.id as string,
      token: (done.body.feedbackUrl as string).split('/f/')[1],
    };
  };

  it('el cliente responde la encuesta sin registrarse', async () => {
    const { token } = await completedVisit();
    const survey = await ctx.http().get(`/api/public/feedback/${token}`).expect(200);
    expect(survey.body.state).toBe('OPEN');
    expect(survey.body.staffName).toBe('Profesional 1');
    await ctx
      .http()
      .post(`/api/public/feedback/${token}`)
      .send({ rating: 5, wouldReturn: 'YES', comment: 'Excelente atención' })
      .expect(200);
    const after = await ctx.http().get(`/api/public/feedback/${token}`).expect(200);
    expect(after.body.state).toBe('ANSWERED');
  });

  it('valida la respuesta', async () => {
    const { token } = await completedVisit();
    await ctx
      .http()
      .post(`/api/public/feedback/${token}`)
      .send({ rating: 6, wouldReturn: 'YES' })
      .expect(400);
    await ctx
      .http()
      .post(`/api/public/feedback/${token}`)
      .send({ rating: 3, wouldReturn: 'SOMETIMES' })
      .expect(400);
    await ctx
      .http()
      .post(`/api/public/feedback/${token}`)
      .send({ rating: 3, wouldReturn: 'MAYBE', comment: 'x'.repeat(1001) })
      .expect(400);
  });

  it('impide respuestas duplicadas, incluso simultáneas', async () => {
    const { token, id } = await completedVisit();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        ctx
          .http()
          .post(`/api/public/feedback/${token}`)
          .send({ rating: (i % 5) + 1, wouldReturn: 'YES' }),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(7);
    expect(await ctx.prisma.customerFeedback.count({ where: { appointmentId: id } })).toBe(1);
    // No se puede generar un enlace nuevo para una encuesta ya respondida.
    await ctx
      .http()
      .post(`/api/businesses/${owner.businessId}/appointments/${id}/feedback-link`)
      .set(auth(owner.token))
      .expect(410);
  });

  it('rechaza encuestas caducadas y tokens inválidos', async () => {
    const { token, id } = await completedVisit();
    await ctx.prisma.customerFeedback.update({
      where: { appointmentId: id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await ctx.http().get(`/api/public/feedback/${token}`).expect(200)).body.state).toBe(
      'EXPIRED',
    );
    await ctx
      .http()
      .post(`/api/public/feedback/${token}`)
      .send({ rating: 5, wouldReturn: 'YES' })
      .expect(410);
    await ctx
      .http()
      .get(`/api/public/feedback/${'x'.repeat(43)}`)
      .expect(404);
  });

  it('solo las citas completadas generan encuesta', async () => {
    const day = futureDate(2, TZ);
    const b = await ctx
      .http()
      .post(`/api/public/businesses/${owner.slug}/appointments`)
      .send(
        bookingPayload(cat.serviceId, localInstant(day, '10:00', TZ), {
          customerPhone: nextPhone(),
        }),
      )
      .expect(201);
    const link = await ctx
      .http()
      .post(`/api/businesses/${owner.businessId}/appointments/${b.body.id}/feedback-link`)
      .set(auth(owner.token))
      .expect(409);
    expect(link.body.error.code).toBe('APPOINTMENT_NOT_COMPLETED');
    expect(await ctx.prisma.customerFeedback.count()).toBe(0);
  });

  it('el dashboard resume resultados y marca muestras pequeñas como no concluyentes', async () => {
    const answers: [number, string, string | undefined][] = [
      [5, 'YES', 'Excelente atención, muy amables'],
      [4, 'YES', undefined],
      [2, 'NO', 'La espera fue demasiado larga'],
    ];
    for (const [i, [rating, wouldReturn, comment]] of answers.entries()) {
      const { token } = await completedVisit(300 - i * 60);
      await ctx
        .http()
        .post(`/api/public/feedback/${token}`)
        .send({ rating, wouldReturn, comment })
        .expect(200);
    }
    await completedVisit(30); // invitación sin respuesta

    const res = await ctx
      .http()
      .get(`/api/businesses/${owner.businessId}/feedback/dashboard`)
      .set(auth(owner.token))
      .expect(200);
    const s = res.body.summary;
    expect(s.responses).toBe(3);
    expect(s.invitations).toBe(4);
    expect(s.responseRate).toBe(0.75);
    expect(s.rating.mean).toBeCloseTo(3.67, 2);
    expect(s.rating.reliable).toBe(false);
    expect(s.reliable).toBe(false);
    expect(s.wouldReturn.yesRate).toBeCloseTo(0.667, 3);
    expect(res.body.detailed).toBe(true);
    expect(res.body.byStaff[0].rating.n).toBe(3);
    expect(res.body.byService[0].name).toBe('Corte clásico');
    expect(res.body.monthly.length).toBeGreaterThanOrEqual(1);
    expect(res.body.pendingNegative).toBe(1);
    expect(res.body.commentCategories.waiting_time).toBe(1);

    const negative = await ctx
      .http()
      .get(`/api/businesses/${owner.businessId}/feedback`)
      .query({ filter: 'negative' })
      .set(auth(owner.token))
      .expect(200);
    expect(negative.body).toHaveLength(1);
    await ctx
      .http()
      .patch(`/api/businesses/${owner.businessId}/feedback/${negative.body[0].id}`)
      .set(auth(owner.token))
      .send({ followUpStatus: 'IN_PROGRESS', followUpNote: 'Llamamos al cliente' })
      .expect(200);
    await ctx
      .http()
      .patch(`/api/businesses/${owner.businessId}/feedback/${negative.body[0].id}`)
      .set(auth(owner.token))
      .send({ followUpStatus: 'RESOLVED' })
      .expect(200);
    const after = await ctx
      .http()
      .get(`/api/businesses/${owner.businessId}/feedback/dashboard`)
      .set(auth(owner.token))
      .expect(200);
    expect(after.body.pendingNegative).toBe(0);
  });

  it('el plan STARTER solo ve el resumen', async () => {
    const starter = await ctx.prisma.plan.findUniqueOrThrow({ where: { code: 'STARTER' } });
    await ctx.prisma.subscription.update({
      where: { businessId: owner.businessId },
      data: { planId: starter.id },
    });
    const res = await ctx
      .http()
      .get(`/api/businesses/${owner.businessId}/feedback/dashboard`)
      .set(auth(owner.token))
      .expect(200);
    expect(res.body.detailed).toBe(false);
    expect(res.body.byStaff).toBeUndefined();
  });
});

describe('Notificaciones', () => {
  let ctx: TestContext;
  let owner: Owner;
  let cat: { serviceId: string; staffIds: string[] };
  let service: NotificationsService;

  beforeAll(async () => {
    ctx = await createTestApp();
    service = ctx.app.get(NotificationsService);
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    owner = await registerOwner(ctx, { timezone: TZ });
    cat = await setupCatalog(ctx, owner);
  });
  afterAll(() => ctx.app.close());

  const book = (consent: boolean, hhmm = '10:00') =>
    ctx
      .http()
      .post(`/api/public/businesses/${owner.slug}/appointments`)
      .send(
        bookingPayload(cat.serviceId, localInstant(futureDate(2, TZ), hhmm, TZ), {
          customerPhone: nextPhone(),
          whatsappConsent: consent,
        }),
      )
      .expect(201);

  it('sin proveedor configurado usa el modo de desarrollo identificado (no marca SENT)', async () => {
    await book(true);
    await service.processDue();
    const rows = await ctx.prisma.notification.findMany();
    expect(rows.every((r) => r.status === 'DEV_LOGGED')).toBe(true);
    expect(rows.some((r) => r.status === 'SENT')).toBe(false);
    // El enlace con token se elimina del payload tras procesarse.
    expect(JSON.stringify(rows.map((r) => r.payload))).not.toMatch(/\/m\/[A-Za-z0-9_-]{43}/);
  });

  it('respeta el consentimiento de WhatsApp', async () => {
    await book(false);
    const wa = await ctx.prisma.notification.findFirstOrThrow({ where: { channel: 'WHATSAPP' } });
    expect(wa.status).toBe('SKIPPED_NO_CONSENT');
  });

  it('envía con un proveedor real (simulado en la prueba), sin duplicar y con reintentos', async () => {
    const sent: OutgoingMessage[] = [];
    let failNext = true;
    const fake: NotificationProvider = {
      name: 'fake-wa',
      channel: 'WHATSAPP',
      send: async (m) => {
        if (failNext) {
          failNext = false;
          return { ok: false, retryable: true, error: '503 temporal' };
        }
        sent.push(m);
        return { ok: true, providerMessageId: 'wamid.1' };
      },
    };
    service.setProvider(fake);
    const b = await book(true);
    await service.processDue(); // primer intento falla y se reprograma
    let wa = await ctx.prisma.notification.findFirstOrThrow({ where: { channel: 'WHATSAPP' } });
    expect(wa.status).toBe('PENDING');
    expect(wa.attempts).toBe(1);
    await ctx.prisma.notification.update({
      where: { id: wa.id },
      data: { nextAttemptAt: new Date() },
    });
    await Promise.all([service.processDue(), service.processDue(), service.processDue()]);
    wa = await ctx.prisma.notification.findFirstOrThrow({ where: { channel: 'WHATSAPP' } });
    expect(wa.status).toBe('SENT');
    expect(sent).toHaveLength(1);
    expect(sent[0].templateParams[1]).toBeTruthy();
    expect(sent[0].text).toContain('/m/');

    // Volver a encolar el mismo evento no crea duplicados (idempotencia).
    await ctx.prisma.$transaction((tx) =>
      service.enqueueAppointmentEvent(tx, b.body.id, 'BOOKING_CONFIRMED'),
    );
    expect(
      await ctx.prisma.notification.count({
        where: { event: 'BOOKING_CONFIRMED', channel: 'WHATSAPP' },
      }),
    ).toBe(1);
  });

  it('programa recordatorios una sola vez por horario', async () => {
    const b = await book(true);
    await ctx.prisma.appointment.update({
      where: { id: b.body.id },
      data: {
        startsAt: new Date(Date.now() + 20 * 3_600_000),
        endsAt: new Date(Date.now() + 20.5 * 3_600_000),
        createdAt: new Date(Date.now() - 86_400_000),
      },
    });
    await service.scheduleReminders();
    await service.scheduleReminders();
    expect(await ctx.prisma.notification.count({ where: { event: 'REMINDER' } })).toBe(1);
  });
});

describe('Carga de imágenes', () => {
  let ctx: TestContext;
  let owner: Owner;
  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    owner = await registerOwner(ctx);
  });
  afterAll(() => ctx.app.close());

  const png = () =>
    sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#cc3366' } })
      .png()
      .toBuffer();

  it('procesa, redimensiona y sirve una imagen válida', async () => {
    const cat = await setupCatalog(ctx, owner);
    const res = await ctx
      .http()
      .post(`/api/businesses/${owner.businessId}/media/staff-photo`)
      .query({ targetId: cat.staffIds[0] })
      .set(auth(owner.token))
      .attach('file', await png(), { filename: 'foto.png', contentType: 'image/png' })
      .expect(201);
    expect(res.body.width).toBe(800);
    expect(res.body.url).toMatch(/^\/api\/media\/businesses\/.+\.webp$/);
    const file = await ctx.http().get(res.body.url).expect(200);
    expect(file.headers['content-type']).toBe('image/webp');
    const staff = await ctx.prisma.staff.findUniqueOrThrow({ where: { id: cat.staffIds[0] } });
    expect(staff.photoPath).toBe(res.body.path);
    expect(await ctx.prisma.storedFile.count({ where: { businessId: owner.businessId } })).toBe(1);
  });

  it('rechaza archivos que no son imágenes aunque declaren serlo', async () => {
    const res = await ctx
      .http()
      .post(`/api/businesses/${owner.businessId}/media/logo`)
      .set(auth(owner.token))
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'logo.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_IMAGE');
  });

  it('rechaza archivos demasiado grandes', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 1);
    await ctx
      .http()
      .post(`/api/businesses/${owner.businessId}/media/logo`)
      .set(auth(owner.token))
      .attach('file', big, { filename: 'big.png', contentType: 'image/png' })
      .expect(413);
  });

  it('no permite subir imágenes a recursos de otro negocio', async () => {
    const other = await registerOwner(ctx);
    const cat = await setupCatalog(ctx, other);
    await ctx
      .http()
      .post(`/api/businesses/${owner.businessId}/media/staff-photo`)
      .query({ targetId: cat.staffIds[0] })
      .set(auth(owner.token))
      .attach('file', await png(), { filename: 'f.png', contentType: 'image/png' })
      .expect(404);
    await ctx
      .http()
      .post(`/api/businesses/${other.businessId}/media/logo`)
      .set(auth(owner.token))
      .attach('file', await png(), { filename: 'f.png', contentType: 'image/png' })
      .expect(404);
  });
});
