import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Appointment, Business, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService, Tx, isExclusionViolation } from '../prisma/prisma.service';
import { AppError, badRequest, conflict, forbidden, gone, notFound } from '../common/errors';
import { generateToken, hashToken, isWellFormedToken } from '../common/crypto';
import { normalizePhone } from '../common/phone';
import { env } from '../config/env';
import { AuditService } from '../audit/audit.service';
import { PlansService } from '../subscriptions/plans.service';
import { AvailabilityService } from '../availability/availability.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FeedbackService } from '../feedback/feedback.service';
import type { TenantContext } from '../common/request-context';
import {
  AdminRescheduleDto,
  AgendaQueryDto,
  CreateBlockDto,
  CreateWalkInDto,
  PublicBookingDto,
} from './dto';
import { adminAppointmentInclude, serializeAdminAppointment } from './serialize';

const MAX_CUSTOMER_RESCHEDULES = 3;
const MANAGE_TOKEN_GRACE_DAYS = 7;
const MAX_AGENDA_RANGE_MS = 42 * 86_400_000;

export const slotUnavailable = () =>
  new AppError('SLOT_UNAVAILABLE', HttpStatus.CONFLICT, 'El horario ya no está disponible');

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlansService,
    private readonly availability: AvailabilityService,
    private readonly notifications: NotificationsService,
    private readonly feedback: FeedbackService,
  ) {}

  // ───────────────────────── Reserva pública ─────────────────────────

  async createPublicBooking(slug: string, dto: PublicBookingDto, ip: string) {
    if (dto.website) throw badRequest('INVALID_REQUEST'); // honeypot
    const business = await this.prisma.business.findUnique({ where: { slug } });
    if (!business || business.status !== 'ACTIVE') throw notFound('BUSINESS_NOT_FOUND');

    const phone = normalizePhone(dto.customerPhone, dto.phoneCountry ?? business.country);
    if (!phone) throw badRequest('INVALID_PHONE', 'Número de teléfono inválido');

    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw badRequest('INVALID_START');

    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, businessId: business.id, active: true },
    });
    if (!service) throw notFound('SERVICE_NOT_FOUND');

    const candidates = await this.candidateStaff(
      business,
      service.id,
      startsAt,
      dto.staffId ?? null,
    );
    if (candidates.length === 0) throw slotUnavailable();

    const manageToken = generateToken();
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

    for (const staffId of candidates) {
      try {
        const appointment = await this.prisma.$transaction(async (tx) => {
          await this.plans.assertCanBook(business.id, business.timezone, tx);
          const available = await this.availability.isStartAvailable(
            business,
            { serviceId: service.id, staffId, startsAt },
            tx,
          );
          if (!available) throw slotUnavailable();

          const customer = await tx.customer.upsert({
            where: { businessId_phoneE164: { businessId: business.id, phoneE164: phone } },
            create: {
              businessId: business.id,
              name: dto.customerName,
              phoneE164: phone,
              whatsappConsent: Boolean(dto.whatsappConsent),
              consentAt: dto.whatsappConsent ? new Date() : null,
            },
            update: {
              name: dto.customerName,
              ...(dto.whatsappConsent !== undefined
                ? {
                    whatsappConsent: dto.whatsappConsent,
                    consentAt: dto.whatsappConsent ? new Date() : null,
                  }
                : {}),
            },
          });

          const active = await tx.appointment.count({
            where: {
              businessId: business.id,
              customerId: customer.id,
              status: 'CONFIRMED',
              startsAt: { gt: new Date() },
            },
          });
          if (active >= env().MAX_ACTIVE_BOOKINGS_PER_PHONE) {
            throw new AppError('TOO_MANY_ACTIVE_BOOKINGS', HttpStatus.TOO_MANY_REQUESTS);
          }

          const staff = await tx.staff.findUniqueOrThrow({ where: { id: staffId } });
          const created = await tx.appointment.create({
            data: {
              businessId: business.id,
              branchId: staff.branchId,
              staffId,
              serviceId: service.id,
              customerId: customer.id,
              type: 'ONLINE',
              status: 'CONFIRMED',
              startsAt,
              endsAt,
              priceSnapshot: service.price,
              currency: business.currency,
              notes: dto.notes,
              manageTokenHash: hashToken(manageToken),
              manageTokenExpiresAt: new Date(
                endsAt.getTime() + MANAGE_TOKEN_GRACE_DAYS * 86_400_000,
              ),
            },
          });
          await this.notifications.enqueueAppointmentEvent(tx, created.id, 'BOOKING_CONFIRMED', {
            manageToken,
          });
          await this.audit.log(
            {
              businessId: business.id,
              action: 'appointment.public_create',
              targetType: 'Appointment',
              targetId: created.id,
              ip,
            },
            tx,
          );
          return created;
        });
        return { ...(await this.publicView(appointment.id)), manageToken };
      } catch (err) {
        if (isExclusionViolation(err)) continue; // otro cliente ganó el horario: probar el siguiente profesional
        if (err instanceof AppError && err.code === 'SLOT_UNAVAILABLE' && candidates.length > 1)
          continue;
        throw err;
      }
    }
    throw slotUnavailable();
  }

  /** Profesionales candidatos para un inicio; con "cualquiera", ordenados por menor carga del día. */
  private async candidateStaff(
    business: Business,
    serviceId: string,
    startsAt: Date,
    staffId: string | null,
  ) {
    if (staffId) {
      const ok = await this.prisma.staffService.findFirst({
        where: { businessId: business.id, staffId, serviceId, staff: { active: true } },
      });
      return ok ? [staffId] : [];
    }
    const day = DateTime.fromJSDate(startsAt, { zone: business.timezone }).toISODate()!;
    const slots = await this.availability.slots(business, { serviceId, from: day, to: day });
    const slot = (slots.get(day) ?? []).find((s) => s.startsAt === startsAt.toISOString());
    if (!slot) return [];
    const dayStart = DateTime.fromJSDate(startsAt, { zone: business.timezone }).startOf('day');
    const loads = await this.prisma.appointment.groupBy({
      by: ['staffId'],
      where: {
        businessId: business.id,
        staffId: { in: slot.staffIds },
        status: { not: 'CANCELED' },
        type: { not: 'BLOCKED' },
        startsAt: { gte: dayStart.toJSDate(), lt: dayStart.plus({ days: 1 }).toJSDate() },
      },
      _count: { _all: true },
    });
    const load = new Map(loads.map((l) => [l.staffId, l._count._all]));
    return [...slot.staffIds].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0));
  }

  // ───────────────────────── Gestión por enlace seguro ─────────────────────────

  private async findByManageToken(token: string) {
    if (!isWellFormedToken(token)) throw notFound('APPOINTMENT_NOT_FOUND');
    const appt = await this.prisma.appointment.findUnique({
      where: { manageTokenHash: hashToken(token) },
      include: { business: true },
    });
    // Misma respuesta para token inexistente y caducado: no se filtra información.
    if (!appt || !appt.manageTokenExpiresAt || appt.manageTokenExpiresAt < new Date()) {
      throw notFound('APPOINTMENT_NOT_FOUND');
    }
    return appt;
  }

  async publicView(appointmentId: string) {
    const a = await this.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: {
        business: true,
        service: true,
        staff: { select: { id: true, name: true } },
        customer: { select: { name: true } },
        branch: { select: { name: true, address: true, timezone: true } },
      },
    });
    const now = Date.now();
    const cutoff = a.startsAt.getTime() - a.business.cancelWindowMinutes * 60_000;
    const modifiable = a.status === 'CONFIRMED' && now < cutoff && a.business.status === 'ACTIVE';
    return {
      id: a.id,
      status: a.status,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      timezone: a.branch.timezone,
      business: {
        name: a.business.name,
        slug: a.business.slug,
        primaryColor: a.business.primaryColor,
        locale: a.business.locale,
        cancelWindowMinutes: a.business.cancelWindowMinutes,
      },
      branch: { name: a.branch.name, address: a.branch.address },
      service: a.service
        ? { id: a.service.id, name: a.service.name, durationMinutes: a.service.durationMinutes }
        : null,
      staff: a.staff,
      customerName: a.customer?.name ?? null,
      price: a.priceSnapshot?.toFixed(2) ?? null,
      currency: a.currency,
      canCancel: modifiable,
      canReschedule: modifiable && a.rescheduleCount < MAX_CUSTOMER_RESCHEDULES,
    };
  }

  async getByToken(token: string) {
    const appt = await this.findByManageToken(token);
    return this.publicView(appt.id);
  }

  async availabilityByToken(token: string, from: string, to?: string) {
    const appt = await this.findByManageToken(token);
    if (!appt.serviceId) throw badRequest('NOT_RESCHEDULABLE');
    const map = await this.availability.slots(appt.business, {
      serviceId: appt.serviceId,
      staffId: appt.staffId,
      from,
      to: to ?? from,
      excludeAppointmentId: appt.id,
    });
    return toDayList(map);
  }

  async cancelByToken(token: string, reason: string | undefined, ip: string) {
    const appt = await this.findByManageToken(token);
    const view = await this.publicView(appt.id);
    if (!view.canCancel) throw conflict('CANCEL_NOT_ALLOWED');
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.appointment.updateMany({
        where: { id: appt.id, status: 'CONFIRMED' },
        data: {
          status: 'CANCELED',
          canceledAt: new Date(),
          canceledBy: 'CUSTOMER',
          cancelReason: reason,
        },
      });
      if (res.count !== 1) throw conflict('CANCEL_NOT_ALLOWED');
      await this.notifications.enqueueAppointmentEvent(tx, appt.id, 'BOOKING_CANCELED');
      await this.audit.log(
        {
          businessId: appt.businessId,
          action: 'appointment.customer_cancel',
          targetType: 'Appointment',
          targetId: appt.id,
          ip,
        },
        tx,
      );
    });
    return this.publicView(appt.id);
  }

  async rescheduleByToken(token: string, startsAtIso: string, ip: string) {
    const appt = await this.findByManageToken(token);
    const view = await this.publicView(appt.id);
    if (!view.canReschedule || !appt.serviceId) throw conflict('RESCHEDULE_NOT_ALLOWED');
    const startsAt = new Date(startsAtIso);
    const duration = appt.endsAt.getTime() - appt.startsAt.getTime();
    const endsAt = new Date(startsAt.getTime() + duration);
    try {
      await this.prisma.$transaction(async (tx) => {
        const ok = await this.availability.isStartAvailable(
          appt.business,
          {
            serviceId: appt.serviceId!,
            staffId: appt.staffId,
            startsAt,
            excludeAppointmentId: appt.id,
          },
          tx,
        );
        if (!ok) throw slotUnavailable();
        const res = await tx.appointment.updateMany({
          where: { id: appt.id, status: 'CONFIRMED', rescheduleCount: appt.rescheduleCount },
          data: {
            startsAt,
            endsAt,
            rescheduleCount: { increment: 1 },
            manageTokenExpiresAt: new Date(endsAt.getTime() + MANAGE_TOKEN_GRACE_DAYS * 86_400_000),
          },
        });
        if (res.count !== 1) throw conflict('RESCHEDULE_NOT_ALLOWED');
        await this.notifications.enqueueAppointmentEvent(tx, appt.id, 'BOOKING_RESCHEDULED', {
          manageToken: token,
        });
        await this.audit.log(
          {
            businessId: appt.businessId,
            action: 'appointment.customer_reschedule',
            targetType: 'Appointment',
            targetId: appt.id,
            ip,
            metadata: { from: appt.startsAt.toISOString(), to: startsAt.toISOString() },
          },
          tx,
        );
      });
    } catch (err) {
      if (isExclusionViolation(err)) throw slotUnavailable();
      throw err;
    }
    return this.publicView(appt.id);
  }

  // ───────────────────────── Agenda administrativa ─────────────────────────

  async agenda(tenant: TenantContext, q: AgendaQueryDto) {
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (!(to > from) || to.getTime() - from.getTime() > MAX_AGENDA_RANGE_MS)
      throw badRequest('INVALID_DATE_RANGE');
    const items = await this.prisma.appointment.findMany({
      where: {
        businessId: tenant.businessId,
        startsAt: { lt: to },
        endsAt: { gt: from },
        ...(q.staffId ? { staffId: q.staffId } : {}),
      },
      include: adminAppointmentInclude,
      orderBy: { startsAt: 'asc' },
    });
    return items.map(serializeAdminAppointment);
  }

  private assertOwnStaff(tenant: TenantContext, staffId: string) {
    if (tenant.role === 'STAFF' && tenant.staffId !== staffId) throw forbidden('INSUFFICIENT_ROLE');
  }

  private async loadStaff(tx: Tx, businessId: string, staffId: string) {
    const staff = await tx.staff.findFirst({ where: { id: staffId, businessId } });
    if (!staff) throw notFound('STAFF_NOT_FOUND');
    return staff;
  }

  async createWalkIn(tenant: TenantContext, actorUserId: string, dto: CreateWalkInDto) {
    this.assertOwnStaff(tenant, dto.staffId);
    try {
      const appt = await this.prisma.$transaction(async (tx) => {
        const staff = await this.loadStaff(tx, tenant.businessId, dto.staffId);
        let duration = dto.durationMinutes;
        let price: Prisma.Decimal | null = null;
        if (dto.serviceId) {
          const service = await tx.service.findFirst({
            where: { id: dto.serviceId, businessId: tenant.businessId },
          });
          if (!service) throw notFound('SERVICE_NOT_FOUND');
          duration ??= service.durationMinutes;
          price = service.price;
        }
        if (!duration) throw badRequest('DURATION_REQUIRED');
        await this.plans.assertCanBook(tenant.businessId, tenant.timezone, tx);
        const startsAt = dto.startsAt ? new Date(dto.startsAt) : roundDownMinutes(new Date(), 5);
        const created = await tx.appointment.create({
          data: {
            businessId: tenant.businessId,
            branchId: staff.branchId,
            staffId: staff.id,
            serviceId: dto.serviceId ?? null,
            type: 'WALK_IN',
            status: 'CONFIRMED',
            startsAt,
            endsAt: new Date(startsAt.getTime() + duration * 60_000),
            priceSnapshot: price,
            currency: price ? tenant.currency : null,
            walkInName: dto.name || null,
            notes: dto.notes,
            createdById: actorUserId,
          },
          include: adminAppointmentInclude,
        });
        await this.audit.log(
          {
            actorUserId,
            businessId: tenant.businessId,
            action: 'appointment.walk_in',
            targetType: 'Appointment',
            targetId: created.id,
          },
          tx,
        );
        return created;
      });
      return serializeAdminAppointment(appt);
    } catch (err) {
      if (isExclusionViolation(err)) throw slotUnavailable();
      throw err;
    }
  }

  async createBlock(tenant: TenantContext, actorUserId: string, dto: CreateBlockDto) {
    this.assertOwnStaff(tenant, dto.staffId);
    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt
      ? new Date(dto.endsAt)
      : dto.durationMinutes
        ? new Date(startsAt.getTime() + dto.durationMinutes * 60_000)
        : null;
    if (!endsAt || endsAt <= startsAt) throw badRequest('INVALID_RANGE');
    if (endsAt.getTime() - startsAt.getTime() > 24 * 3_600_000) throw badRequest('BLOCK_TOO_LONG');
    try {
      const appt = await this.prisma.$transaction(async (tx) => {
        const staff = await this.loadStaff(tx, tenant.businessId, dto.staffId);
        const created = await tx.appointment.create({
          data: {
            businessId: tenant.businessId,
            branchId: staff.branchId,
            staffId: staff.id,
            type: 'BLOCKED',
            status: 'CONFIRMED',
            startsAt,
            endsAt,
            blockReason: dto.reason,
            notes: dto.notes,
            createdById: actorUserId,
          },
          include: adminAppointmentInclude,
        });
        await this.audit.log(
          {
            actorUserId,
            businessId: tenant.businessId,
            action: 'appointment.block',
            targetType: 'Appointment',
            targetId: created.id,
          },
          tx,
        );
        return created;
      });
      return serializeAdminAppointment(appt);
    } catch (err) {
      if (isExclusionViolation(err)) throw slotUnavailable();
      throw err;
    }
  }

  private async findForTenant(tenant: TenantContext, id: string): Promise<Appointment> {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, businessId: tenant.businessId },
    });
    if (!appt) throw notFound('APPOINTMENT_NOT_FOUND');
    this.assertOwnStaff(tenant, appt.staffId);
    return appt;
  }

  private async transition(
    tenant: TenantContext,
    actorUserId: string,
    id: string,
    action: 'cancel' | 'complete' | 'no_show',
    reason?: string,
  ) {
    const appt = await this.findForTenant(tenant, id);
    if (appt.status !== 'CONFIRMED') throw conflict('INVALID_STATUS_TRANSITION');
    if (action !== 'cancel') {
      if (appt.type === 'BLOCKED') throw conflict('INVALID_STATUS_TRANSITION');
      if (appt.startsAt.getTime() > Date.now()) throw conflict('APPOINTMENT_NOT_STARTED');
    }
    const data: Prisma.AppointmentUpdateManyMutationInput =
      action === 'cancel'
        ? { status: 'CANCELED', canceledAt: new Date(), canceledBy: 'STAFF', cancelReason: reason }
        : action === 'complete'
          ? { status: 'COMPLETED', completedAt: new Date() }
          : { status: 'NO_SHOW' };

    let feedbackToken: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.appointment.updateMany({ where: { id, status: 'CONFIRMED' }, data });
      if (res.count !== 1) throw conflict('INVALID_STATUS_TRANSITION');
      if (action === 'cancel' && appt.type === 'ONLINE') {
        await this.notifications.enqueueAppointmentEvent(tx, id, 'BOOKING_CANCELED');
      }
      if (action === 'complete') {
        feedbackToken = await this.feedback.createInvitation(tx, id);
        if (feedbackToken && appt.type === 'ONLINE') {
          await this.notifications.enqueueAppointmentEvent(tx, id, 'FEEDBACK_INVITATION', {
            feedbackToken,
          });
        }
      }
      await this.audit.log(
        {
          actorUserId,
          businessId: tenant.businessId,
          action: `appointment.${action}`,
          targetType: 'Appointment',
          targetId: id,
        },
        tx,
      );
    });
    const updated = await this.prisma.appointment.findUniqueOrThrow({
      where: { id },
      include: adminAppointmentInclude,
    });
    return {
      ...serializeAdminAppointment(updated),
      ...(feedbackToken
        ? { feedbackUrl: `${env().PUBLIC_APP_URL.replace(/\/$/, '')}/f/${feedbackToken}` }
        : {}),
    };
  }

  cancel(t: TenantContext, u: string, id: string, reason?: string) {
    return this.transition(t, u, id, 'cancel', reason);
  }
  complete(t: TenantContext, u: string, id: string) {
    return this.transition(t, u, id, 'complete');
  }
  noShow(t: TenantContext, u: string, id: string) {
    return this.transition(t, u, id, 'no_show');
  }

  async adminReschedule(
    tenant: TenantContext,
    actorUserId: string,
    id: string,
    dto: AdminRescheduleDto,
  ) {
    const appt = await this.findForTenant(tenant, id);
    if (appt.status !== 'CONFIRMED') throw conflict('INVALID_STATUS_TRANSITION');
    const staffId = dto.staffId ?? appt.staffId;
    this.assertOwnStaff(tenant, staffId);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(startsAt.getTime() + (appt.endsAt.getTime() - appt.startsAt.getTime()));
    try {
      await this.prisma.$transaction(async (tx) => {
        const staff = await this.loadStaff(tx, tenant.businessId, staffId);
        if (appt.serviceId && staffId !== appt.staffId) {
          const offers = await tx.staffService.findFirst({
            where: { staffId, serviceId: appt.serviceId },
          });
          if (!offers) throw badRequest('STAFF_DOES_NOT_OFFER_SERVICE');
        }
        await tx.appointment.update({
          where: { id },
          data: {
            startsAt,
            endsAt,
            staffId,
            branchId: staff.branchId,
            ...(appt.manageTokenHash
              ? {
                  manageTokenExpiresAt: new Date(
                    endsAt.getTime() + MANAGE_TOKEN_GRACE_DAYS * 86_400_000,
                  ),
                }
              : {}),
          },
        });
        if (appt.type === 'ONLINE')
          await this.notifications.enqueueAppointmentEvent(tx, id, 'BOOKING_RESCHEDULED');
        await this.audit.log(
          {
            actorUserId,
            businessId: tenant.businessId,
            action: 'appointment.reschedule',
            targetType: 'Appointment',
            targetId: id,
            metadata: { from: appt.startsAt.toISOString(), to: startsAt.toISOString(), staffId },
          },
          tx,
        );
      });
    } catch (err) {
      if (isExclusionViolation(err)) throw slotUnavailable();
      throw err;
    }
    const updated = await this.prisma.appointment.findUniqueOrThrow({
      where: { id },
      include: adminAppointmentInclude,
    });
    return serializeAdminAppointment(updated);
  }

  /** Enlace de encuesta para compartir manualmente (p. ej. walk-ins o sin proveedor de WhatsApp). */
  async regenerateFeedbackLink(tenant: TenantContext, id: string) {
    const appt = await this.findForTenant(tenant, id);
    if (appt.status !== 'COMPLETED') throw conflict('APPOINTMENT_NOT_COMPLETED');
    const token = await this.prisma.$transaction((tx) =>
      this.feedback.createInvitation(tx, id, { rotate: true }),
    );
    if (!token) throw gone('FEEDBACK_ALREADY_ANSWERED');
    return { feedbackUrl: `${env().PUBLIC_APP_URL.replace(/\/$/, '')}/f/${token}` };
  }
}

export function toDayList(
  map: Map<string, { startsAt: string; endsAt: string; staffIds: string[] }[]>,
) {
  return [...map.entries()].map(([date, slots]) => ({ date, slots }));
}

function roundDownMinutes(d: Date, minutes: number) {
  const ms = minutes * 60_000;
  return new Date(Math.floor(d.getTime() / ms) * ms);
}
