import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';

export interface AuditEntry {
  actorUserId?: string | null;
  businessId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Registra dentro de la transacción indicada o, si no hay, de forma independiente. */
  async log(entry: AuditEntry, tx?: Tx) {
    const client = tx ?? this.prisma;
    try {
      await client.auditLog.create({ data: { ...entry } });
    } catch (err) {
      if (tx) throw err;
      this.logger.error(
        `No se pudo registrar auditoría ${entry.action}: ${(err as Error).message}`,
      );
    }
  }
}
