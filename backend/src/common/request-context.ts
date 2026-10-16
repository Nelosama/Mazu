import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { MembershipRole } from '@prisma/client';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface TenantContext {
  businessId: string;
  membershipId: string;
  role: MembershipRole;
  staffId: string | null;
  timezone: string;
  currency: string;
  locale: string;
}

export interface AppRequest extends Request {
  user?: AuthUser;
  tenant?: TenantContext;
}

export const IS_PUBLIC = 'isPublic';
/** Marca un endpoint como accesible sin sesión. Por defecto todo exige autenticación. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
/** Roles de tenant permitidos. Sin este decorador, cualquier miembro activo accede. */
export const Roles = (...roles: MembershipRole[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  return req.user!;
});

export const Tenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.tenant) throw new Error('TenantGuard no aplicado a esta ruta');
  return req.tenant;
});

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
