import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { IncidentsModule } from './admin/incidents.service';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { BusinessesModule } from './businesses/businesses.module';
import { BranchesModule } from './branches/branches.module';
import { StaffModule } from './staff/staff.module';
import { ServicesModule } from './services/services.module';
import { AvailabilityModule } from './availability/availability.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FeedbackModule } from './feedback/feedback.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { PublicModule } from './public/public.module';
import { AdminModule } from './admin/admin.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { HealthController } from './health.controller';
import { env } from './config/env';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      // Límites en memoria por IP: adecuados para una única instancia (ver docs/architecture.md).
      throttlers: [
        { name: 'default', ttl: 60_000, limit: 120 },
        { name: 'long', ttl: 3_600_000, limit: 3000 },
      ],
      skipIf: () => env().NODE_ENV === 'test' && process.env.THROTTLE_IN_TESTS !== 'true',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    IncidentsModule,
    SubscriptionsModule,
    StorageModule,
    AuthModule,
    BusinessesModule,
    BranchesModule,
    StaffModule,
    ServicesModule,
    AvailabilityModule,
    NotificationsModule,
    FeedbackModule,
    AppointmentsModule,
    PublicModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
