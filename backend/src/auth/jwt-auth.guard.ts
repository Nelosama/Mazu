import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AppRequest, IS_PUBLIC } from '../common/request-context';
import { unauthorized } from '../common/errors';

interface AccessPayload {
  sub: string;
  typ: 'access';
}

/** Guard global: toda ruta exige un token de acceso válido salvo las marcadas con @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AppRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized('AUTH_REQUIRED');

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(header.slice(7));
    } catch {
      throw unauthorized('TOKEN_INVALID');
    }
    if (payload.typ !== 'access') throw unauthorized('TOKEN_INVALID');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') throw unauthorized('TOKEN_INVALID');
    req.user = { id: user.id, email: user.email, name: user.name };
    return true;
  }
}
