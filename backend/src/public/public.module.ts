import { Body, Controller, Get, Header, HttpCode, Module, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AppRequest, Public, clientIp } from '../common/request-context';
import { notFound } from '../common/errors';
import { AvailabilityService } from '../availability/availability.service';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AppointmentsService, toDayList } from '../appointments/appointments.service';
import { AvailabilityQueryDto, CancelDto, PublicBookingDto, RescheduleByTokenDto, TokenAvailabilityQueryDto } from '../appointments/dto';
import { FeedbackService } from '../feedback/feedback.service';
import { SubmitFeedbackDto } from '../feedback/dto';
import { PlansService } from '../subscriptions/plans.service';
import { publicFileUrl } from '../storage/public-url';
import { SLUG } from '../common/validation';
import { env } from '../config/env';

const DEFAULT_COLOR = '#4F46E5';

function assertSlug(slug: string) {
  if (!SLUG.test(slug) || slug.length > 60) throw notFound('BUSINESS_NOT_FOUND');
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

@Public()
@Controller('public')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly appointments: AppointmentsService,
    private readonly feedback: FeedbackService,
    private readonly plans: PlansService,
  ) {}

  private async activeBusiness(slug: string) {
    assertSlug(slug);
    const b = await this.prisma.business.findUnique({ where: { slug } });
    if (!b || b.status !== 'ACTIVE') throw notFound('BUSINESS_NOT_FOUND');
    return b;
  }

  @Get('businesses/:slug')
  @Header('Cache-Control', 'public, max-age=30')
  async profile(@Param('slug') slug: string) {
    const b = await this.activeBusiness(slug);
    const [features, branches, services, staff, portfolio] = await Promise.all([
      this.plans.featuresFor(b.id),
      this.prisma.branch.findMany({ where: { businessId: b.id, status: 'ACTIVE' }, select: { id: true, name: true, address: true, timezone: true } }),
      this.prisma.service.findMany({
        where: { businessId: b.id, active: true },
        include: { staff: { where: { staff: { active: true } }, select: { staffId: true } } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.staff.findMany({
        where: { businessId: b.id, active: true },
        include: { services: { select: { serviceId: true } } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.portfolioItem.findMany({ where: { businessId: b.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], take: 30 }),
    ]);
    const activeServiceIds = new Set(services.map((s) => s.id));
    return {
      business: {
        name: b.name,
        slug: b.slug,
        type: b.type,
        description: b.description,
        logoUrl: publicFileUrl(b.logoPath),
        coverUrl: publicFileUrl(b.coverPath),
        primaryColor: features.customBranding ? b.primaryColor : DEFAULT_COLOR,
        country: b.country,
        currency: b.currency,
        locale: b.locale,
        timezone: b.timezone,
        cancelWindowMinutes: b.cancelWindowMinutes,
        maxAdvanceDays: b.maxAdvanceDays,
      },
      branches,
      services: services
        .filter((s) => s.staff.length > 0)
        .map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          category: s.category,
          price: s.price.toFixed(2),
          currency: b.currency,
          durationMinutes: s.durationMinutes,
          photoUrl: publicFileUrl(s.photoPath),
          staffIds: s.staff.map((x) => x.staffId),
        })),
      // Solo datos de presentación: sin comisiones ni datos internos.
      staff: staff.map((s) => ({
        id: s.id,
        name: s.name,
        specialty: s.specialty,
        bio: s.bio,
        photoUrl: publicFileUrl(s.photoPath),
        serviceIds: s.services.map((x) => x.serviceId).filter((id) => activeServiceIds.has(id)),
      })),
      portfolio: portfolio.map((p) => ({ id: p.id, staffId: p.staffId, caption: p.caption, url: publicFileUrl(p.path) })),
    };
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('businesses/:slug/availability')
  async availabilityFor(@Param('slug') slug: string, @Query() q: AvailabilityQueryDto) {
    const b = await this.activeBusiness(slug);
    const map = await this.availability.slots(b, { serviceId: q.serviceId, staffId: q.staffId, from: q.from, to: q.to ?? q.from });
    return toDayList(map);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })
  @Post('businesses/:slug/appointments')
  book(@Param('slug') slug: string, @Body() dto: PublicBookingDto, @Req() req: AppRequest) {
    assertSlug(slug);
    return this.appointments.createPublicBooking(slug, dto, clientIp(req));
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('manage/:token')
  manage(@Param('token') token: string) {
    return this.appointments.getByToken(token);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('manage/:token/availability')
  manageAvailability(@Param('token') token: string, @Query() q: TokenAvailabilityQueryDto) {
    return this.appointments.availabilityByToken(token, q.from, q.to);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('manage/:token/cancel')
  cancel(@Param('token') token: string, @Body() dto: CancelDto, @Req() req: AppRequest) {
    return this.appointments.cancelByToken(token, dto.reason, clientIp(req));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('manage/:token/reschedule')
  reschedule(@Param('token') token: string, @Body() dto: RescheduleByTokenDto, @Req() req: AppRequest) {
    return this.appointments.rescheduleByToken(token, dto.startsAt, clientIp(req));
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('feedback/:token')
  survey(@Param('token') token: string) {
    return this.feedback.publicSurvey(token);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('feedback/:token')
  submit(@Param('token') token: string, @Body() dto: SubmitFeedbackDto, @Req() req: AppRequest) {
    return this.feedback.submit(token, dto, clientIp(req));
  }
}

/**
 * Página mínima con metadatos Open Graph para compartir en redes sociales y WhatsApp.
 * Los rastreadores no ejecutan la SPA; las personas son redirigidas a la página real.
 */
@Public()
@Controller('share')
export class ShareController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('b/:slug')
  async business(@Param('slug') slug: string, @Res() res: Response) {
    assertSlug(slug);
    const b = await this.prisma.business.findUnique({ where: { slug } });
    if (!b || b.status !== 'ACTIVE') throw notFound('BUSINESS_NOT_FOUND');
    const base = env().PUBLIC_APP_URL.replace(/\/$/, '');
    const url = `${base}/b/${b.slug}`;
    const image = publicFileUrl(b.coverPath ?? b.logoPath);
    const absImage = image && image.startsWith('/') ? `${base}${image}` : image;
    const title = escapeHtml(b.name);
    const description = escapeHtml((b.description ?? '').slice(0, 200));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(`<!doctype html><html lang="${escapeHtml(b.locale)}"><head><meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${escapeHtml(url)}">
<meta property="og:type" content="website"><meta property="og:title" content="${title}">
<meta property="og:description" content="${description}"><meta property="og:url" content="${escapeHtml(url)}">
${absImage ? `<meta property="og:image" content="${escapeHtml(absImage)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${escapeHtml(url)}">
</head><body><a href="${escapeHtml(url)}">${title}</a></body></html>`);
  }
}

@Module({ imports: [AppointmentsModule], controllers: [PublicController, ShareController] })
export class PublicModule {}
