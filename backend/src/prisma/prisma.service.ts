import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

export type Tx = Prisma.TransactionClient;

/** Código SQLSTATE de violación de restricción de exclusión. */
export const EXCLUSION_VIOLATION = '23P01';

export function isExclusionViolation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = JSON.stringify(err.meta ?? {});
    return (
      meta.includes(EXCLUSION_VIOLATION) ||
      meta.includes('no_overlap') ||
      err.message.includes('23P01')
    );
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    return err.message.includes('23P01') || err.message.includes('Appointment_no_overlap_excl');
  }
  return false;
}

export function isUniqueViolation(err: unknown, field?: string): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    if (!field) return true;
    const target = err.meta?.target;
    return Array.isArray(target) ? target.includes(field) : String(target ?? '').includes(field);
  }
  return false;
}
