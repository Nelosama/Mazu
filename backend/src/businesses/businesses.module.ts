import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { hashPassword } from '../common/password';
import { PrismaService } from '../prisma/prisma.service';
import { TenantGuard } from '../auth/tenant.guard';
import { AuthUser, CurrentUser, Roles, Tenant, TenantContext } from '../common/request-context';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import { BusinessesService } from './businesses.service';
import { CreateBusinessDto, UpdateBusinessDto } from './dto';
import { AddMemberDto, UpdateMemberDto } from './members';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(businessId: string) {
    const items = await this.prisma.businessMembership.findMany({
      where: { businessId },
      include: { user: { select: { id: true, name: true, email: true } }, staff: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((m) => ({ id: m.id, role: m.role, status: m.status, user: m.user, staff: m.staff }));
  }

  async add(tenant: TenantContext, actorUserId: string, dto: AddMemberDto) {
    if (dto.role === 'OWNER' && tenant.role !== 'OWNER') throw forbidden('INSUFFICIENT_ROLE');
    if (dto.staffId) {
      const staff = await this.prisma.staff.findFirst({ where: { id: dto.staffId, businessId: tenant.businessId } });
      if (!staff) throw badRequest('STAFF_NOT_IN_BUSINESS');
    }
    const membership = await this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email: dto.email } });
      if (!user) {
        if (!dto.password || !dto.name) throw badRequest('NEW_USER_REQUIRES_NAME_AND_PASSWORD');
        user = await tx.user.create({
          data: {
            email: dto.email,
            name: dto.name,
            passwordHash: await hashPassword(dto.password),
          },
        });
      }
      const existing = await tx.businessMembership.findUnique({ where: { userId_businessId: { userId: user.id, businessId: tenant.businessId } } });
      if (existing) throw conflict('ALREADY_MEMBER');
      return tx.businessMembership.create({
        data: { userId: user.id, businessId: tenant.businessId, role: dto.role, staffId: dto.staffId ?? null },
      });
    });
    await this.audit.log({ actorUserId, businessId: tenant.businessId, action: 'member.add', targetType: 'BusinessMembership', targetId: membership.id, metadata: { role: dto.role } });
    return membership;
  }

  async update(tenant: TenantContext, actorUserId: string, id: string, dto: UpdateMemberDto) {
    const m = await this.prisma.businessMembership.findFirst({ where: { id, businessId: tenant.businessId } });
    if (!m) throw notFound('MEMBER_NOT_FOUND');
    const touchesOwner = m.role === 'OWNER' || dto.role === 'OWNER';
    if (touchesOwner && tenant.role !== 'OWNER') throw forbidden('INSUFFICIENT_ROLE');
    if (m.role === 'OWNER' && (dto.role && dto.role !== 'OWNER' || dto.status === 'INACTIVE')) {
      const owners = await this.prisma.businessMembership.count({ where: { businessId: tenant.businessId, role: 'OWNER', status: 'ACTIVE' } });
      if (owners <= 1) throw conflict('LAST_OWNER');
    }
    if (dto.staffId) {
      const staff = await this.prisma.staff.findFirst({ where: { id: dto.staffId, businessId: tenant.businessId } });
      if (!staff) throw badRequest('STAFF_NOT_IN_BUSINESS');
    }
    const updated = await this.prisma.businessMembership.update({ where: { id }, data: dto });
    if (dto.status === 'INACTIVE') {
      await this.prisma.refreshToken.updateMany({ where: { userId: m.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.audit.log({ actorUserId, businessId: tenant.businessId, action: 'member.update', targetType: 'BusinessMembership', targetId: id, metadata: { ...dto } });
    return updated;
  }
}

@Controller('businesses')
export class BusinessesController {
  constructor(
    private readonly businesses: BusinessesService,
    private readonly members: MembersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  mine(@CurrentUser() u: AuthUser) {
    return this.businesses.listForUser(u.id);
  }

  /** Un usuario existente puede crear otro negocio (queda como OWNER). */
  @Post()
  async create(@CurrentUser() u: AuthUser, @Body() dto: CreateBusinessDto) {
    const b = await this.prisma.$transaction((tx) => this.businesses.createWithOwner(tx, u.id, dto));
    return this.businesses.get(b.id);
  }

  @UseGuards(TenantGuard)
  @Get(':businessId')
  get(@Tenant() t: TenantContext) {
    return this.businesses.get(t.businessId);
  }

  @UseGuards(TenantGuard)
  @Roles('OWNER', 'ADMIN')
  @Patch(':businessId')
  update(@Tenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() dto: UpdateBusinessDto) {
    return this.businesses.update(t.businessId, u.id, dto);
  }

  @UseGuards(TenantGuard)
  @Roles('OWNER', 'ADMIN')
  @Get(':businessId/members')
  listMembers(@Tenant() t: TenantContext) {
    return this.members.list(t.businessId);
  }

  @UseGuards(TenantGuard)
  @Roles('OWNER', 'ADMIN')
  @Post(':businessId/members')
  addMember(@Tenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() dto: AddMemberDto) {
    return this.members.add(t, u.id, dto);
  }

  @UseGuards(TenantGuard)
  @Roles('OWNER', 'ADMIN')
  @Patch(':businessId/members/:id')
  updateMember(@Tenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMemberDto) {
    return this.members.update(t, u.id, id, dto);
  }
}

@Module({
  controllers: [BusinessesController],
  providers: [BusinessesService, MembersService],
  exports: [BusinessesService],
})
export class BusinessesModule {}
