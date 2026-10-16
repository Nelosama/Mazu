import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { env } from '../config/env';

/**
 * Política de retención (ver docs/security.md):
 * - Clientes sin citas dentro de la ventana de retención se eliminan; sus citas antiguas
 *   quedan anónimas (sin cliente ni notas). Las encuestas quedan sin vínculo personal.
 * - El contenido de notificaciones antiguas y los refresh tokens caducados se purgan.
 */
@Injectable()
export class RetentionJob {
  private readonly logger = new Logger(RetentionJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run() {
    if (!env().JOBS_ENABLED) return;
    try {
      const result = await this.purge();
      this.logger.log(`Retención: ${JSON.stringify(result)}`);
    } catch (err) {
      this.logger.error(`Retención falló: ${(err as Error).message}`);
    }
  }

  async purge(now = new Date()) {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - env().DATA_RETENTION_MONTHS);

    const stale = await this.prisma.customer.findMany({
      where: { appointments: { none: { endsAt: { gte: cutoff } } } },
      select: { id: true },
      take: 1000,
    });
    const ids = stale.map((c) => c.id);
    if (ids.length) {
      await this.prisma.$transaction([
        this.prisma.appointment.updateMany({
          where: { customerId: { in: ids } },
          data: { customerId: null, notes: null, cancelReason: null },
        }),
        this.prisma.customerFeedback.updateMany({
          where: { appointment: { customerId: null }, respondedAt: { lt: cutoff } },
          data: { followUpNote: null },
        }),
        this.prisma.customer.deleteMany({ where: { id: { in: ids } } }),
      ]);
    }
    const notifications = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - 90 * 86_400_000) } },
    });
    const tokens = await this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } });
    return {
      anonymizedCustomers: ids.length,
      notificationsPurged: notifications.count,
      refreshTokensPurged: tokens.count,
    };
  }
}
