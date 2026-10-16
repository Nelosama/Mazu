import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { conflict, gone, notFound } from '../common/errors';
import { generateToken, hashToken, isWellFormedToken } from '../common/crypto';
import { env } from '../config/env';
import { AuditService } from '../audit/audit.service';
import { PlansService } from '../subscriptions/plans.service';
import { publicFileUrl } from '../storage/public-url';
import type { TenantContext } from '../common/request-context';
import {
  FeedbackListQueryDto,
  FeedbackQueryDto,
  SubmitFeedbackDto,
  UpdateFollowUpDto,
} from './dto';
import { categorize, meanWithInterval, MIN_RELIABLE_SAMPLE, round, wilsonInterval } from './stats';

const NEGATIVE: Prisma.CustomerFeedbackWhereInput = {
  OR: [{ rating: { lte: 2 } }, { wouldReturn: 'NO' }],
};

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlansService,
  ) {}

  /**
   * Crea (o rota) la invitación de encuesta de una cita completada. Devuelve el token en claro
   * una sola vez; en BD solo queda su hash. Devuelve null si el negocio desactivó encuestas
   * o la encuesta ya fue respondida.
   */
  async createInvitation(
    tx: Tx,
    appointmentId: string,
    opts: { rotate?: boolean } = {},
  ): Promise<string | null> {
    const appt = await tx.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { business: { select: { feedbackEnabled: true } }, feedback: true },
    });
    if (!appt.business.feedbackEnabled || appt.status !== 'COMPLETED' || appt.type === 'BLOCKED')
      return null;
    const token = generateToken();
    const expiresAt = new Date(Date.now() + env().FEEDBACK_TOKEN_TTL_DAYS * 86_400_000);
    if (appt.feedback) {
      if (appt.feedback.respondedAt || !opts.rotate) return null;
      await tx.customerFeedback.update({
        where: { id: appt.feedback.id },
        data: { tokenHash: hashToken(token), expiresAt },
      });
      return token;
    }
    await tx.customerFeedback.create({
      data: {
        businessId: appt.businessId,
        appointmentId: appt.id,
        staffId: appt.staffId,
        serviceId: appt.serviceId,
        tokenHash: hashToken(token),
        expiresAt,
      },
    });
    return token;
  }

  private async findByToken(token: string) {
    if (!isWellFormedToken(token)) throw notFound('FEEDBACK_NOT_FOUND');
    const fb = await this.prisma.customerFeedback.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        business: true,
        staff: { select: { name: true } },
        service: { select: { name: true } },
        appointment: {
          select: { startsAt: true, status: true, branch: { select: { timezone: true } } },
        },
      },
    });
    if (!fb) throw notFound('FEEDBACK_NOT_FOUND');
    return fb;
  }

  async publicSurvey(token: string) {
    const fb = await this.findByToken(token);
    const state = fb.respondedAt ? 'ANSWERED' : fb.expiresAt < new Date() ? 'EXPIRED' : 'OPEN';
    return {
      state,
      business: {
        name: fb.business.name,
        slug: fb.business.slug,
        primaryColor: fb.business.primaryColor,
        logoUrl: publicFileUrl(fb.business.logoPath),
        locale: fb.business.locale,
      },
      staffName: fb.staff.name,
      serviceName: fb.service?.name ?? null,
      appointmentAt: fb.appointment.startsAt.toISOString(),
      timezone: fb.appointment.branch.timezone,
    };
  }

  async submit(token: string, dto: SubmitFeedbackDto, ip: string) {
    const fb = await this.findByToken(token);
    if (fb.respondedAt) throw conflict('FEEDBACK_ALREADY_ANSWERED');
    if (fb.expiresAt < new Date()) throw gone('FEEDBACK_EXPIRED');
    if (fb.appointment.status !== 'COMPLETED') throw conflict('APPOINTMENT_NOT_COMPLETED');

    // Actualización condicional: aunque lleguen dos envíos simultáneos, solo uno se registra.
    const res = await this.prisma.customerFeedback.updateMany({
      where: {
        id: fb.id,
        respondedAt: null,
        expiresAt: { gt: new Date() },
        appointment: { status: 'COMPLETED' },
      },
      data: {
        rating: dto.rating,
        wouldReturn: dto.wouldReturn,
        comment: dto.comment || null,
        respondedAt: new Date(),
        followUpStatus: 'PENDING',
      },
    });
    if (res.count !== 1) throw conflict('FEEDBACK_ALREADY_ANSWERED');
    await this.audit.log({
      businessId: fb.businessId,
      action: 'feedback.submit',
      targetType: 'CustomerFeedback',
      targetId: fb.id,
      ip,
    });
    return { ok: true };
  }

  // ───────────────────────── Dashboard ─────────────────────────

  private where(tenant: TenantContext, q: FeedbackQueryDto): Prisma.CustomerFeedbackWhereInput {
    const from = q.from ? new Date(q.from) : DateTime.now().minus({ months: 12 }).toJSDate();
    const to = q.to ? new Date(q.to) : new Date();
    return {
      businessId: tenant.businessId,
      createdAt: { gte: from, lt: to },
      ...(q.staffId ? { staffId: q.staffId } : {}),
      ...(q.serviceId ? { serviceId: q.serviceId } : {}),
    };
  }

  async dashboard(tenant: TenantContext, q: FeedbackQueryDto) {
    const features = await this.plans.featuresFor(tenant.businessId);
    const where = this.where(tenant, q);
    const [invitations, answered] = await Promise.all([
      this.prisma.customerFeedback.count({ where }),
      this.prisma.customerFeedback.findMany({
        where: { ...where, respondedAt: { not: null } },
        select: {
          rating: true,
          wouldReturn: true,
          respondedAt: true,
          staffId: true,
          serviceId: true,
          comment: true,
          staff: { select: { name: true } },
          service: { select: { name: true } },
        },
      }),
    ]);

    const ratings = answered.map((a) => a.rating!);
    const yes = answered.filter((a) => a.wouldReturn === 'YES').length;
    const maybe = answered.filter((a) => a.wouldReturn === 'MAYBE').length;
    const no = answered.filter((a) => a.wouldReturn === 'NO').length;
    const n = answered.length;
    const summary = {
      invitations,
      responses: n,
      responseRate: invitations ? round(n / invitations, 3) : null,
      rating: meanWithInterval(ratings),
      distribution: [1, 2, 3, 4, 5].map((star) => ({
        star,
        count: ratings.filter((r) => r === star).length,
      })),
      wouldReturn: {
        yes,
        maybe,
        no,
        yesRate: n ? round(yes / n, 3) : null,
        yesInterval: wilsonInterval(yes, n),
      },
      minReliableSample: MIN_RELIABLE_SAMPLE,
      reliable: n >= MIN_RELIABLE_SAMPLE,
    };

    if (!features.satisfactionReports) return { summary, detailed: false as const };

    const group = (
      key: 'staffId' | 'serviceId',
      label: (a: (typeof answered)[number]) => string | undefined,
    ) => {
      const map = new Map<string, { name: string; ratings: number[]; yes: number }>();
      for (const a of answered) {
        const id = a[key];
        if (!id) continue;
        const g = map.get(id) ?? { name: label(a) ?? '—', ratings: [], yes: 0 };
        g.ratings.push(a.rating!);
        if (a.wouldReturn === 'YES') g.yes++;
        map.set(id, g);
      }
      return [...map.entries()]
        .map(([id, g]) => ({
          id,
          name: g.name,
          rating: meanWithInterval(g.ratings),
          yesRate: round(g.yes / g.ratings.length, 3),
        }))
        .sort((a, b) => b.rating.n - a.rating.n);
    };

    const monthly = await this.prisma.$queryRaw<
      { month: string; responses: bigint; avg: number | null }[]
    >`
      SELECT to_char(date_trunc('month', f."respondedAt" AT TIME ZONE ${tenant.timezone}), 'YYYY-MM') AS month,
             count(*) AS responses,
             avg(f."rating")::float AS avg
      FROM "CustomerFeedback" f
      WHERE f."businessId" = ${tenant.businessId}::uuid
        AND f."respondedAt" IS NOT NULL
        AND f."respondedAt" >= now() - interval '12 months'
      GROUP BY 1 ORDER BY 1`;

    const categories: Record<string, number> = {};
    for (const a of answered)
      for (const c of categorize(a.comment)) categories[c] = (categories[c] ?? 0) + 1;

    return {
      summary,
      detailed: true as const,
      byStaff: group('staffId', (a) => a.staff?.name),
      byService: group('serviceId', (a) => a.service?.name),
      monthly: monthly.map((m) => ({
        month: m.month,
        responses: Number(m.responses),
        avg: m.avg === null ? null : round(m.avg),
        reliable: Number(m.responses) >= MIN_RELIABLE_SAMPLE,
      })),
      commentCategories: categories,
      pendingNegative: await this.prisma.customerFeedback.count({
        where: {
          ...where,
          respondedAt: { not: null },
          followUpStatus: { not: 'RESOLVED' },
          ...NEGATIVE,
        },
      }),
    };
  }

  async list(tenant: TenantContext, q: FeedbackListQueryDto) {
    const items = await this.prisma.customerFeedback.findMany({
      where: {
        ...this.where(tenant, q),
        respondedAt: { not: null },
        ...(q.followUpStatus ? { followUpStatus: q.followUpStatus } : {}),
        ...(q.filter === 'negative' ? NEGATIVE : {}),
        ...(q.filter === 'with_comment' ? { comment: { not: null } } : {}),
      },
      include: {
        staff: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
        appointment: {
          select: { startsAt: true, customer: { select: { name: true } }, walkInName: true },
        },
      },
      orderBy: { respondedAt: 'desc' },
      take: q.limit ?? 50,
    });
    return items.map((f) => ({
      id: f.id,
      rating: f.rating,
      wouldReturn: f.wouldReturn,
      comment: f.comment,
      categories: categorize(f.comment),
      respondedAt: f.respondedAt,
      followUpStatus: f.followUpStatus,
      followUpNote: f.followUpNote,
      staff: f.staff,
      service: f.service,
      appointmentAt: f.appointment.startsAt,
      customerName: f.appointment.customer?.name ?? f.appointment.walkInName ?? null,
      negative: (f.rating ?? 5) <= 2 || f.wouldReturn === 'NO',
    }));
  }

  async updateFollowUp(
    tenant: TenantContext,
    actorUserId: string,
    id: string,
    dto: UpdateFollowUpDto,
  ) {
    const res = await this.prisma.customerFeedback.updateMany({
      where: { id, businessId: tenant.businessId, respondedAt: { not: null } },
      data: { followUpStatus: dto.followUpStatus, followUpNote: dto.followUpNote },
    });
    if (!res.count) throw notFound('FEEDBACK_NOT_FOUND');
    await this.audit.log({
      actorUserId,
      businessId: tenant.businessId,
      action: 'feedback.follow_up',
      targetType: 'CustomerFeedback',
      targetId: id,
      metadata: { status: dto.followUpStatus },
    });
    return { ok: true };
  }
}
