import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationEvent, NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { env } from '../config/env';
import { NotificationProvider } from './providers/provider';
import { WhatsAppCloudProvider } from './providers/whatsapp-cloud.provider';
import { ResendEmailProvider } from './providers/resend-email.provider';
import { render, TemplateData } from './templates';
import { IncidentsService } from '../admin/incidents.service';

const MAX_ATTEMPTS = 5;
const BATCH = 20;

const OWNER_EVENTS: NotificationEvent[] = ['BOOKING_CONFIRMED', 'BOOKING_CANCELED', 'BOOKING_RESCHEDULED'];

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly providers = new Map<NotificationChannel, NotificationProvider>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly incidents: IncidentsService,
  ) {
    const e = env();
    if (e.WHATSAPP_PROVIDER === 'meta') {
      this.providers.set('WHATSAPP', new WhatsAppCloudProvider(e.WHATSAPP_PHONE_NUMBER_ID!, e.WHATSAPP_ACCESS_TOKEN!, e.WHATSAPP_API_VERSION));
    }
    if (e.EMAIL_PROVIDER === 'resend') {
      this.providers.set('EMAIL', new ResendEmailProvider(e.RESEND_API_KEY!, e.EMAIL_FROM!));
    }
  }

  /** Para pruebas: sustituye un proveedor. */
  setProvider(provider: NotificationProvider) {
    this.providers.set(provider.channel, provider);
  }

  providerStatus() {
    return {
      WHATSAPP: this.providers.get('WHATSAPP')?.name ?? null,
      EMAIL: this.providers.get('EMAIL')?.name ?? null,
      devLog: env().NOTIFICATIONS_DEV_LOG,
    };
  }

  /**
   * Patrón outbox: las notificaciones se insertan en la misma transacción que el cambio
   * de la cita y un worker las envía después. La clave de idempotencia impide duplicados.
   */
  async enqueueAppointmentEvent(
    tx: Tx,
    appointmentId: string,
    event: NotificationEvent,
    tokens: { manageToken?: string; feedbackToken?: string } = {},
  ) {
    const a = await tx.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: {
        business: { include: { memberships: { where: { status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } }, include: { user: true } } } },
        customer: true,
        service: { select: { name: true } },
        staff: { select: { name: true } },
        branch: { select: { timezone: true } },
      },
    });
    const base = env().PUBLIC_APP_URL.replace(/\/$/, '');
    const variant = event === 'BOOKING_RESCHEDULED' || event === 'REMINDER' ? `:${a.startsAt.toISOString()}` : '';
    const data: TemplateData = {
      businessName: a.business.name,
      customerName: a.customer?.name ?? a.walkInName,
      serviceName: a.service?.name,
      staffName: a.staff.name,
      startsAt: a.startsAt.toISOString(),
      timezone: a.branch.timezone,
    };
    const rows: Prisma.NotificationCreateManyInput[] = [];

    if (a.customer) {
      const url = tokens.feedbackToken
        ? `${base}/f/${tokens.feedbackToken}`
        : tokens.manageToken
          ? `${base}/m/${tokens.manageToken}`
          : null;
      rows.push({
        businessId: a.businessId,
        appointmentId: a.id,
        channel: 'WHATSAPP',
        event,
        recipient: a.customer.phoneE164,
        locale: a.business.locale,
        payload: { ...data, url } as unknown as Prisma.InputJsonValue,
        idempotencyKey: `${event}:${a.id}:WHATSAPP:${a.customer.phoneE164}${variant}`,
        status: a.customer.whatsappConsent ? 'PENDING' : 'SKIPPED_NO_CONSENT',
      });
    }

    if (OWNER_EVENTS.includes(event)) {
      for (const m of a.business.memberships) {
        rows.push({
          businessId: a.businessId,
          appointmentId: a.id,
          channel: 'EMAIL',
          event,
          recipient: m.user.email,
          locale: m.user.preferredLocale ?? a.business.locale,
          payload: { ...data, url: `${base}/app/${a.businessId}/agenda` } as unknown as Prisma.InputJsonValue,
          idempotencyKey: `${event}:${a.id}:EMAIL:${m.user.email}${variant}`,
        });
      }
    }
    if (rows.length) await tx.notification.createMany({ data: rows, skipDuplicates: true });
  }

  /** Reclama notificaciones pendientes con SKIP LOCKED (seguro con varias instancias). */
  async processDue(): Promise<number> {
    const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "Notification" SET "attempts" = "attempts" + 1,
             "nextAttemptAt" = now() + interval '10 minutes', "updatedAt" = now()
      WHERE "id" IN (
        SELECT "id" FROM "Notification"
        WHERE "status" = 'PENDING' AND "nextAttemptAt" <= now()
        ORDER BY "nextAttemptAt" LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id"`;
    for (const { id } of claimed) await this.deliver(id);
    return claimed.length;
  }

  private async deliver(id: string) {
    const n = await this.prisma.notification.findUniqueOrThrow({ where: { id } });
    const provider = this.providers.get(n.channel);
    const payload = n.payload as unknown as TemplateData;
    const msg = render(n.event, n.locale, payload);

    const finish = (status: NotificationStatus, extra: Prisma.NotificationUpdateInput = {}) =>
      this.prisma.notification.update({
        where: { id },
        // Tras el envío se elimina el enlace con token del payload almacenado.
        data: { status, payload: { ...payload, url: payload.url ? '[redacted]' : null } as unknown as Prisma.InputJsonValue, ...extra },
      });

    if (!n.recipient) return finish('SKIPPED_NO_RECIPIENT');

    if (!provider) {
      if (env().NOTIFICATIONS_DEV_LOG && env().NODE_ENV !== 'production') {
        // Mecanismo local de desarrollo: NO es un envío real y queda marcado como DEV_LOGGED.
        this.logger.log(`[DEV-LOG ${n.channel}] → ${n.recipient}: ${msg.text}`);
        return finish('DEV_LOGGED', { provider: 'dev-log' });
      }
      return finish('SKIPPED_NO_PROVIDER');
    }

    const result = await provider.send({
      idempotencyKey: n.idempotencyKey,
      channel: n.channel,
      event: n.event,
      recipient: n.recipient,
      locale: n.locale,
      ...msg,
    });
    if (result.ok) {
      return finish('SENT', { provider: provider.name, providerMessageId: result.providerMessageId, sentAt: new Date(), lastError: null });
    }
    const exhausted = !result.retryable || n.attempts >= MAX_ATTEMPTS;
    if (exhausted) {
      await this.incidents.record('notifications', `${provider.name}: ${result.error}`, { event: n.event, channel: n.channel }, 'WARNING');
      return finish('FAILED', { provider: provider.name, lastError: result.error });
    }
    const backoffMin = 2 ** n.attempts;
    await this.prisma.notification.update({
      where: { id },
      data: { lastError: result.error, nextAttemptAt: new Date(Date.now() + backoffMin * 60_000) },
    });
  }

  /** Programa recordatorios ~24 h antes. Idempotente por (cita, hora de inicio). */
  async scheduleReminders(now = new Date()) {
    const from = new Date(now.getTime() + 2 * 3_600_000);
    const to = new Date(now.getTime() + 24 * 3_600_000);
    const due = await this.prisma.appointment.findMany({
      where: { type: 'ONLINE', status: 'CONFIRMED', startsAt: { gte: from, lte: to }, business: { status: 'ACTIVE' } },
      select: { id: true, startsAt: true, createdAt: true },
      take: 500,
    });
    let count = 0;
    for (const a of due) {
      if (a.startsAt.getTime() - a.createdAt.getTime() < 6 * 3_600_000) continue; // reservado hace poco
      await this.prisma.$transaction((tx) => this.enqueueAppointmentEvent(tx, a.id, 'REMINDER'));
      count++;
    }
    return count;
  }

  async list(businessId: string, limit = 50) {
    const rows = await this.prisma.notification.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      select: { id: true, channel: true, event: true, status: true, provider: true, attempts: true, lastError: true, createdAt: true, sentAt: true },
    });
    return rows;
  }
}
