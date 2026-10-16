import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hashPassword, verifyPassword } from '../common/password';
import { randomUUID } from 'node:crypto';
import { PrismaService, isUniqueViolation } from '../prisma/prisma.service';
import { conflict, unauthorized } from '../common/errors';
import { generateToken, hashToken } from '../common/crypto';
import { env } from '../config/env';
import { AuditService } from '../audit/audit.service';
import { BusinessesService } from '../businesses/businesses.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto';

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  // Hash ficticio para igualar el tiempo de respuesta cuando el correo no existe.
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly businesses: BusinessesService,
  ) {}

  hashPassword(password: string) {
    return hashPassword(password);
  }

  async register(dto: RegisterDto, ip: string, userAgent?: string) {
    const passwordHash = await this.hashPassword(dto.password);
    try {
      const { user, business } = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { name: dto.name, email: dto.email, passwordHash, preferredLocale: dto.preferredLocale ?? dto.business.locale },
        });
        const business = await this.businesses.createWithOwner(tx, user.id, dto.business);
        await this.audit.log({ actorUserId: user.id, action: 'auth.register', ip }, tx);
        return { user, business };
      });
      const session = await this.issueSession(user.id, randomUUID(), userAgent);
      return { user: this.publicUser(user), businessId: business.id, session };
    } catch (err) {
      if (isUniqueViolation(err, 'email')) throw conflict('EMAIL_TAKEN');
      throw err;
    }
  }

  async login(dto: LoginDto, ip: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      this.dummyHash ??= hashPassword(generateToken());
      await verifyPassword(await this.dummyHash, dto.password);
      throw unauthorized('INVALID_CREDENTIALS');
    }
    const ok = await verifyPassword(user.passwordHash, dto.password);
    if (!ok || user.status !== 'ACTIVE') {
      await this.audit.log({ actorUserId: user.id, action: 'auth.login_failed', ip });
      throw unauthorized('INVALID_CREDENTIALS');
    }
    await this.audit.log({ actorUserId: user.id, action: 'auth.login', ip });
    const session = await this.issueSession(user.id, randomUUID(), userAgent);
    return { user: this.publicUser(user), session };
  }

  /** Rotación de refresh token con detección de reutilización (revoca toda la familia). */
  async refresh(rawToken: string | undefined, userAgent?: string) {
    if (!rawToken) throw unauthorized('REFRESH_REQUIRED');
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!record) throw unauthorized('REFRESH_INVALID');
    if (record.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({ actorUserId: record.userId, action: 'auth.refresh_reuse_detected' });
      throw unauthorized('REFRESH_INVALID');
    }
    if (record.expiresAt < new Date() || record.user.status !== 'ACTIVE') throw unauthorized('REFRESH_INVALID');

    // Revocación condicional: si dos peticiones concurrentes usan el mismo token, solo una gana.
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) throw unauthorized('REFRESH_INVALID');
    const session = await this.issueSession(record.userId, record.familyId, userAgent);
    return { user: this.publicUser(record.user), session };
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (record) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await verifyPassword(user.passwordHash, dto.currentPassword);
    if (!ok) throw unauthorized('INVALID_CREDENTIALS');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(dto.newPassword) } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actorUserId: userId, action: 'auth.password_changed' });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { platformAdmin: true },
    });
    const memberships = await this.businesses.listForUser(userId);
    return { user: this.publicUser(user), isPlatformAdmin: Boolean(user.platformAdmin), memberships };
  }

  private async issueSession(userId: string, familyId: string, userAgent?: string): Promise<IssuedSession> {
    const ttl = env().JWT_ACCESS_TTL_SECONDS;
    const accessToken = await this.jwt.signAsync({ sub: userId, typ: 'access' }, { expiresIn: ttl });
    const refreshToken = generateToken(48);
    const refreshExpiresAt = new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: userAgent?.slice(0, 255),
      },
    });
    return { accessToken, expiresIn: ttl, refreshToken, refreshExpiresAt };
  }

  private publicUser(u: { id: string; name: string; email: string; preferredLocale: string | null }) {
    return { id: u.id, name: u.name, email: u.email, preferredLocale: u.preferredLocale };
  }
}
