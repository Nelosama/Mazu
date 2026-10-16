import { Injectable } from '@nestjs/common';
import { Plan } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { forbidden } from '../common/errors';

export interface PlanFeatures {
  code: string;
  maxStaff: number | null;
  maxBranches: number | null;
  maxMonthlyBookings: number | null;
  customBranding: boolean;
  satisfactionReports: boolean;
  advancedReports: boolean;
}

const NO_PLAN: PlanFeatures = {
  code: 'NONE',
  maxStaff: 1,
  maxBranches: 1,
  maxMonthlyBookings: 0,
  customBranding: false,
  satisfactionReports: false,
  advancedReports: false,
};

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  serialize(plan: Plan) {
    return { ...plan, monthlyPrice: plan.monthlyPrice.toFixed(2) };
  }

  async featuresFor(businessId: string, tx?: Tx): Promise<PlanFeatures> {
    const client = tx ?? this.prisma;
    const sub = await client.subscription.findUnique({ where: { businessId }, include: { plan: true } });
    if (!sub || sub.status === 'CANCELED') return NO_PLAN;
    const p = sub.plan;
    return {
      code: p.code,
      maxStaff: p.maxStaff,
      maxBranches: p.maxBranches,
      maxMonthlyBookings: p.maxMonthlyBookings,
      customBranding: p.customBranding,
      satisfactionReports: p.satisfactionReports,
      advancedReports: p.advancedReports,
    };
  }

  async assertCanAddStaff(businessId: string, tx?: Tx) {
    const client = tx ?? this.prisma;
    const f = await this.featuresFor(businessId, tx);
    if (f.maxStaff === null) return;
    const count = await client.staff.count({ where: { businessId, active: true } });
    if (count >= f.maxStaff) throw forbidden('PLAN_LIMIT_STAFF', `El plan permite ${f.maxStaff} profesionales activos`);
  }

  async assertCanAddBranch(businessId: string, tx?: Tx) {
    const client = tx ?? this.prisma;
    const f = await this.featuresFor(businessId, tx);
    if (f.maxBranches === null) return;
    const count = await client.branch.count({ where: { businessId, status: 'ACTIVE' } });
    if (count >= f.maxBranches) throw forbidden('PLAN_LIMIT_BRANCHES', `El plan permite ${f.maxBranches} sucursales`);
  }

  /** Límite mensual de reservas (ONLINE + WALK_IN) contado en la zona horaria del negocio. */
  async assertCanBook(businessId: string, timezone: string, tx?: Tx) {
    const client = tx ?? this.prisma;
    const f = await this.featuresFor(businessId, tx);
    if (f.maxMonthlyBookings === null) return;
    const start = DateTime.now().setZone(timezone).startOf('month');
    const count = await client.appointment.count({
      where: {
        businessId,
        type: { in: ['ONLINE', 'WALK_IN'] },
        status: { not: 'CANCELED' },
        createdAt: { gte: start.toJSDate(), lt: start.plus({ months: 1 }).toJSDate() },
      },
    });
    if (count >= f.maxMonthlyBookings) throw forbidden('PLAN_LIMIT_BOOKINGS');
  }

  async assertFeature(businessId: string, feature: 'satisfactionReports' | 'advancedReports' | 'customBranding') {
    const f = await this.featuresFor(businessId);
    if (!f[feature]) throw forbidden('PLAN_FEATURE_UNAVAILABLE');
  }
}
