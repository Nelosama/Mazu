import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { IncidentSeverity, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Agrupa errores técnicos por huella para el panel Super Admin (sin datos personales). */
@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    source: string,
    message: string,
    context?: Record<string, unknown>,
    severity: IncidentSeverity = 'ERROR',
  ) {
    const normalized = message
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid')
      .replace(/\+?\d{6,}/g, ':num')
      .slice(0, 500);
    const fingerprint = createHash('sha256').update(`${source}|${normalized}`).digest('hex');
    try {
      await this.prisma.systemIncident.upsert({
        where: { fingerprint },
        create: {
          fingerprint,
          source,
          severity,
          message: normalized,
          context: context as Prisma.InputJsonValue,
        },
        update: { occurrences: { increment: 1 }, lastSeenAt: new Date(), resolvedAt: null },
      });
    } catch (err) {
      this.logger.error(`No se pudo registrar incidencia: ${(err as Error).message}`);
    }
  }
}

@Global()
@Module({ providers: [IncidentsService], exports: [IncidentsService] })
export class IncidentsModule {}
