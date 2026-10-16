import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { generateToken } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { BusinessesService } from '../businesses/businesses.service';
import { PlansService } from '../subscriptions/plans.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AdminBusinessStatusDto,
  AdminCreateBusinessDto,
  AdminSubscriptionDto,
  PlanDto,
  SupportAccessDto,
} from './dto';

const DAY = 86_400_000;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly businesses: BusinessesService,
    private readonly plans: PlansService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Métricas agregadas de la plataforma: sin datos personales de clientes. */
  async metrics() {
    const since30 = new Date(Date.now() - 30 * DAY);
    const [active, suspended, staff, appts30, appts, storage, feedback, failed, incidents, byPlan] =
      await Promise.all([
        this.prisma.business.count({ where: { status: 'ACTIVE' } }),
        this.prisma.business.count({ where: { status: 'SUSPENDED' } }),
        this.prisma.staff.count({ where: { active: true } }),
        this.prisma.appointment.count({
          where: { createdAt: { gte: since30 }, type: { not: 'BLOCKED' } },
        }),
        this.prisma.appointment.count({ where: { type: { not: 'BLOCKED' } } }),
        this.prisma.storedFile.aggregate({ _sum: { sizeBytes: true } }),
        this.prisma.customerFeedback.count({ where: { respondedAt: { not: null } } }),
        this.prisma.notification.count({
          where: { status: 'FAILED', createdAt: { gte: since30 } },
        }),
        this.prisma.systemIncident.count({ where: { resolvedAt: null } }),
        this.prisma.subscription.groupBy({ by: ['planId'], _count: { _all: true } }),
      ]);
    const plans = await this.prisma.plan.findMany();
    return {
      businesses: { active, suspended },
      activeStaff: staff,
      appointments: { last30Days: appts30, total: appts },
      storageBytes: storage._sum.sizeBytes ?? 0,
      feedbackResponses: feedback,
      failedNotifications30d: failed,
      openIncidents: incidents,
      subscriptionsByPlan: byPlan.map((g) => ({
        plan: plans.find((p) => p.id === g.planId)?.code,
        count: g._count._all,
      })),
      notificationProviders: this.notifications.providerStatus(),
    };
  }

  async listBusinesses(q?: string, status?: string) {
    const since30 = new Date(Date.now() - 30 * DAY);
    const items = await this.prisma.business.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { slug: { contains: q.toLowerCase() } },
              ],
            }
          : {}),
        ...(status === 'ACTIVE' || status === 'SUSPENDED' ? { status } : {}),
      },
      include: {
        subscription: { include: { plan: { select: { code: true, name: true } } } },
        _count: { select: { staff: { where: { active: true } }, branches: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const ids = items.map((b) => b.id);
    const [appts, storage] = await Promise.all([
      this.prisma.appointment.groupBy({
        by: ['businessId'],
        where: { businessId: { in: ids }, createdAt: { gte: since30 }, type: { not: 'BLOCKED' } },
        _count: { _all: true },
      }),
      this.prisma.storedFile.groupBy({
        by: ['businessId'],
        where: { businessId: { in: ids } },
        _sum: { sizeBytes: true },
      }),
    ]);
    return items.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      type: b.type,
      country: b.country,
      currency: b.currency,
      timezone: b.timezone,
      status: b.status,
      createdAt: b.createdAt,
      plan: b.subscription?.plan ?? null,
      subscriptionStatus: b.subscription?.status ?? null,
      trialEndsAt: b.subscription?.trialEndsAt ?? null,
      activeStaff: b._count.staff,
      branches: b._count.branches,
      appointments30d: appts.find((a) => a.businessId === b.id)?._count._all ?? 0,
      storageBytes: storage.find((s) => s.businessId === b.id)?._sum.sizeBytes ?? 0,
    }));
  }

  async createBusiness(actorUserId: string, dto: AdminCreateBusinessDto, ip: string) {
    let tempPassword: string | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      let owner = await tx.user.findUnique({ where: { email: dto.owner.email } });
      if (!owner) {
        const password = dto.owner.password ?? (tempPassword = generateToken(12));
        owner = await tx.user.create({
          data: {
            name: dto.owner.name,
            email: dto.owner.email,
            passwordHash: await this.auth.hashPassword(password),
          },
        });
      }
      const business = await this.businesses.createWithOwner(tx, owner.id, dto.business);
      if (dto.planCode) {
        const plan = await tx.plan.findUnique({ where: { code: dto.planCode } });
        if (!plan) throw badRequest('PLAN_NOT_FOUND');
        await tx.subscription.update({
          where: { businessId: business.id },
          data: { planId: plan.id },
        });
      }
      await this.audit.log(
        {
          actorUserId,
          businessId: business.id,
          action: 'admin.business_create',
          targetType: 'Business',
          targetId: business.id,
          ip,
        },
        tx,
      );
      return business;
    });
    // La contraseña temporal se muestra una sola vez al Super Admin para entregarla al dueño.
    return {
      business: { id: result.id, slug: result.slug, name: result.name },
      temporaryPassword: tempPassword,
    };
  }

  async setStatus(
    actorUserId: string,
    businessId: string,
    dto: AdminBusinessStatusDto,
    ip: string,
  ) {
    const b = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!b) throw notFound('BUSINESS_NOT_FOUND');
    await this.prisma.business.update({ where: { id: businessId }, data: { status: dto.status } });
    await this.audit.log({
      actorUserId,
      businessId,
      action: dto.status === 'SUSPENDED' ? 'admin.business_suspend' : 'admin.business_activate',
      targetType: 'Business',
      targetId: businessId,
      metadata: { reason: dto.reason, previous: b.status },
      ip,
    });
    return { id: businessId, status: dto.status };
  }

  async setSubscription(
    actorUserId: string,
    businessId: string,
    dto: AdminSubscriptionDto,
    ip: string,
  ) {
    const plan = await this.prisma.plan.findUnique({ where: { code: dto.planCode } });
    if (!plan) throw badRequest('PLAN_NOT_FOUND');
    const sub = await this.prisma.subscription.upsert({
      where: { businessId },
      create: { businessId, planId: plan.id, status: dto.status ?? 'ACTIVE' },
      update: { planId: plan.id, ...(dto.status ? { status: dto.status } : {}) },
    });
    await this.audit.log({
      actorUserId,
      businessId,
      action: 'admin.subscription_update',
      targetType: 'Subscription',
      targetId: sub.id,
      metadata: { plan: plan.code, status: sub.status },
      ip,
    });
    return { plan: plan.code, status: sub.status };
  }

  async listPlans() {
    const plans = await this.prisma.plan.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { subscriptions: true } } },
    });
    return plans.map((p) => ({
      ...this.plans.serialize(p),
      subscriptions: p._count.subscriptions,
    }));
  }

  async createPlan(actorUserId: string, dto: PlanDto) {
    if (!dto.code || !dto.name || dto.monthlyPrice === undefined)
      throw badRequest('PLAN_FIELDS_REQUIRED');
    try {
      const plan = await this.prisma.plan.create({
        data: {
          ...dto,
          code: dto.code,
          name: dto.name,
          monthlyPrice: new Prisma.Decimal(dto.monthlyPrice),
        },
      });
      await this.audit.log({
        actorUserId,
        action: 'admin.plan_create',
        targetType: 'Plan',
        targetId: plan.id,
      });
      return this.plans.serialize(plan);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        throw conflict('PLAN_CODE_TAKEN');
      throw err;
    }
  }

  async updatePlan(actorUserId: string, id: string, dto: PlanDto) {
    const { code: _ignored, monthlyPrice, ...rest } = dto;
    const plan = await this.prisma.plan
      .update({
        where: { id },
        data: {
          ...rest,
          ...(monthlyPrice !== undefined ? { monthlyPrice: new Prisma.Decimal(monthlyPrice) } : {}),
        },
      })
      .catch(() => {
        throw notFound('PLAN_NOT_FOUND');
      });
    await this.audit.log({
      actorUserId,
      action: 'admin.plan_update',
      targetType: 'Plan',
      targetId: id,
      metadata: { fields: Object.keys(dto) },
    });
    return this.plans.serialize(plan);
  }

  incidents(includeResolved: boolean) {
    return this.prisma.systemIncident.findMany({
      where: includeResolved ? {} : { resolvedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      take: 100,
    });
  }

  async resolveIncident(actorUserId: string, id: string) {
    await this.prisma.systemIncident
      .update({ where: { id }, data: { resolvedAt: new Date() } })
      .catch(() => {
        throw notFound('INCIDENT_NOT_FOUND');
      });
    await this.audit.log({
      actorUserId,
      action: 'admin.incident_resolve',
      targetType: 'SystemIncident',
      targetId: id,
    });
    return { ok: true };
  }

  auditLog(businessId?: string) {
    return this.prisma.auditLog.findMany({
      where: businessId ? { businessId } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { actor: { select: { email: true } } },
    });
  }

  /**
   * Acceso de soporte a datos personales de un negocio: solo con una autorización vigente
   * concedida por el OWNER y registrando motivo y actor en la auditoría.
   */
  async supportAppointments(
    actorUserId: string,
    businessId: string,
    dto: SupportAccessDto,
    ip: string,
  ) {
    const grant = await this.prisma.supportAccessGrant.findFirst({
      where: { businessId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'desc' },
    });
    if (!grant) throw forbidden('SUPPORT_ACCESS_NOT_GRANTED');
    await this.audit.log({
      actorUserId,
      businessId,
      action: 'admin.support_access',
      targetType: 'SupportAccessGrant',
      targetId: grant.id,
      metadata: { reason: dto.reason, scope: 'appointments' },
      ip,
    });
    const items = await this.prisma.appointment.findMany({
      where: { businessId, startsAt: { gte: new Date(Date.now() - 30 * DAY) } },
      include: {
        customer: { select: { name: true, phoneE164: true } },
        staff: { select: { name: true } },
        service: { select: { name: true } },
      },
      orderBy: { startsAt: 'desc' },
      take: 100,
    });
    return { grantExpiresAt: grant.expiresAt, items };
  }
}
