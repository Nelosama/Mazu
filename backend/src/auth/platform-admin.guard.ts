import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppRequest } from '../common/request-context';
import { forbidden } from '../common/errors';

/**
 * Autorización de plataforma: depende exclusivamente de la tabla PlatformAdmin,
 * que no es modificable desde ningún endpoint de tenant.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    if (!req.user) throw forbidden();
    const admin = await this.prisma.platformAdmin.findUnique({ where: { userId: req.user.id } });
    if (!admin || admin.role !== 'SUPER_ADMIN') throw forbidden('PLATFORM_ADMIN_REQUIRED');
    return true;
  }
}
