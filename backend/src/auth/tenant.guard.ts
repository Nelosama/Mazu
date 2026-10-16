import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppRequest, ROLES } from '../common/request-context';
import { forbidden, notFound } from '../common/errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Resuelve el tenant a partir de `:businessId` y exige una membresía activa del usuario.
 * Responde 404 (no 403) cuando no hay membresía para no revelar qué negocios existen.
 * Un negocio suspendido queda en solo lectura.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const businessId = req.params.businessId;
    if (!req.user) throw forbidden();
    if (typeof businessId !== 'string' || !UUID.test(businessId))
      throw notFound('BUSINESS_NOT_FOUND');

    const membership = await this.prisma.businessMembership.findUnique({
      where: { userId_businessId: { userId: req.user.id, businessId } },
      include: {
        business: { select: { status: true, timezone: true, currency: true, locale: true } },
      },
    });
    if (!membership || membership.status !== 'ACTIVE') throw notFound('BUSINESS_NOT_FOUND');

    if (membership.business.status === 'SUSPENDED' && WRITE_METHODS.has(req.method)) {
      throw forbidden('BUSINESS_SUSPENDED');
    }

    const roles = this.reflector.getAllAndOverride<MembershipRole[] | undefined>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && !roles.includes(membership.role)) throw forbidden('INSUFFICIENT_ROLE');

    req.tenant = {
      businessId,
      membershipId: membership.id,
      role: membership.role,
      staffId: membership.staffId,
      timezone: membership.business.timezone,
      currency: membership.business.currency,
      locale: membership.business.locale,
    };
    return true;
  }
}
