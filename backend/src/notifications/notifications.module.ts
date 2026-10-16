import { Controller, Get, Global, Injectable, Logger, Module, UseGuards } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';
import { env } from '../config/env';
import { TenantGuard } from '../auth/tenant.guard';
import { Roles, Tenant, TenantContext } from '../common/request-context';

@Injectable()
export class NotificationsWorker {
  private readonly logger = new Logger(NotificationsWorker.name);
  private running = false;

  constructor(private readonly notifications: NotificationsService) {}

  @Interval(15_000)
  async tick() {
    if (!env().NOTIFICATIONS_WORKER_ENABLED || this.running) return;
    this.running = true;
    try {
      await this.notifications.processDue();
    } catch (err) {
      this.logger.error(`Worker de notificaciones: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  @Interval(10 * 60_000)
  async reminders() {
    if (!env().JOBS_ENABLED) return;
    try {
      await this.notifications.scheduleReminders();
    } catch (err) {
      this.logger.error(`Recordatorios: ${(err as Error).message}`);
    }
  }
}

@UseGuards(TenantGuard)
@Roles('OWNER', 'ADMIN')
@Controller('businesses/:businessId/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@Tenant() t: TenantContext) {
    return { providers: this.notifications.providerStatus(), items: await this.notifications.list(t.businessId) };
  }
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsWorker],
  exports: [NotificationsService],
})
export class NotificationsModule {}
