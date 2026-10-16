import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService, Tx, isUniqueViolation } from '../prisma/prisma.service';
import { conflict, forbidden, notFound } from '../common/errors';
import { slugify } from '../common/validation';
import { env } from '../config/env';
import { AuditService } from '../audit/audit.service';
import { PlansService } from '../subscriptions/plans.service';
import { CreateBusinessDto, UpdateBusinessDto } from './dto';
import { publicFileUrl } from '../storage/public-url';

const RESERVED_SLUGS = new Set([
  'admin',
  'app',
  'api',
  'login',
  'register',
  'www',
  'b',
  'm',
  'f',
  'static',
]);

@Injectable()
export class BusinessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlansService,
  ) {}

  /** Crea el negocio con su sucursal principal, la membresía OWNER y la suscripción inicial. */
  async createWithOwner(tx: Tx, ownerUserId: string, dto: CreateBusinessDto) {
    const slug = await this.resolveSlug(tx, dto.slug, dto.name);
    const plan = await tx.plan.findUnique({ where: { code: env().DEFAULT_PLAN_CODE } });
    if (!plan) throw new Error(`Plan por defecto ${env().DEFAULT_PLAN_CODE} no existe`);

    const business = await tx.business.create({
      data: {
        name: dto.name,
        slug,
        type: dto.type,
        description: dto.description,
        country: dto.country,
        currency: dto.currency,
        timezone: dto.timezone,
        locale: dto.locale,
      },
    });
    await tx.branch.create({
      data: { businessId: business.id, name: 'Principal', timezone: dto.timezone },
    });
    await tx.businessMembership.create({
      data: { businessId: business.id, userId: ownerUserId, role: 'OWNER' },
    });
    const trialDays = env().TRIAL_DAYS;
    await tx.subscription.create({
      data: {
        businessId: business.id,
        planId: plan.id,
        status: trialDays > 0 ? 'TRIAL' : 'ACTIVE',
        trialEndsAt: trialDays > 0 ? new Date(Date.now() + trialDays * 86_400_000) : null,
      },
    });
    await this.audit.log(
      {
        actorUserId: ownerUserId,
        businessId: business.id,
        action: 'business.create',
        targetType: 'Business',
        targetId: business.id,
      },
      tx,
    );
    return business;
  }

  private async resolveSlug(tx: Tx, requested: string | undefined, name: string): Promise<string> {
    if (requested) {
      if (RESERVED_SLUGS.has(requested)) throw conflict('SLUG_TAKEN');
      const exists = await tx.business.findUnique({
        where: { slug: requested },
        select: { id: true },
      });
      if (exists) throw conflict('SLUG_TAKEN');
      return requested;
    }
    let base = slugify(name);
    if (base.length < 3) base = `negocio-${base}`.replace(/-+$/, '');
    for (let i = 0; i < 5; i++) {
      const candidate =
        i === 0 && !RESERVED_SLUGS.has(base) ? base : `${base}-${randomBytes(2).toString('hex')}`;
      const exists = await tx.business.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
    }
    return `${base}-${randomBytes(4).toString('hex')}`;
  }

  async listForUser(userId: string) {
    const memberships = await this.prisma.businessMembership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { business: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      role: m.role,
      staffId: m.staffId,
      business: this.serialize(m.business),
    }));
  }

  async get(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      include: {
        subscription: { include: { plan: true } },
        branches: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!business) throw notFound('BUSINESS_NOT_FOUND');
    return {
      ...this.serialize(business),
      branches: business.branches,
      subscription: business.subscription && {
        status: business.subscription.status,
        trialEndsAt: business.subscription.trialEndsAt,
        plan: this.plans.serialize(business.subscription.plan),
      },
    };
  }

  async update(businessId: string, actorUserId: string, dto: UpdateBusinessDto) {
    if (dto.primaryColor) {
      const features = await this.plans.featuresFor(businessId);
      if (!features.customBranding)
        throw forbidden('PLAN_FEATURE_UNAVAILABLE', 'Personalización no incluida en el plan');
    }
    if (dto.slug && RESERVED_SLUGS.has(dto.slug)) throw conflict('SLUG_TAKEN');
    try {
      const updated = await this.prisma.business.update({ where: { id: businessId }, data: dto });
      await this.audit.log({
        actorUserId,
        businessId,
        action: 'business.update',
        targetType: 'Business',
        targetId: businessId,
        metadata: { fields: Object.keys(dto) } as Prisma.InputJsonValue,
      });
      return this.serialize(updated);
    } catch (err) {
      if (isUniqueViolation(err, 'slug')) throw conflict('SLUG_TAKEN');
      throw err;
    }
  }

  serialize<T extends { logoPath: string | null; coverPath: string | null }>(b: T) {
    return { ...b, logoUrl: publicFileUrl(b.logoPath), coverUrl: publicFileUrl(b.coverPath) };
  }
}
