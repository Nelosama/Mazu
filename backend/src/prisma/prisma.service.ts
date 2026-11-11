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

/** PostgreSQL SQLSTATE 40P01. Concurrent GiST exclusion checks can deadlock before one booking wins. */
export function isDeadlock(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === 'P2034' || err.message.includes('40P01');
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    return err.message.includes('40P01');
  }
  return err instanceof Error && err.message.includes('40P01');
}

export function isUniqueViolation(err: unknown, field?: string): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    if (!field) return true;
    const target = err.meta?.target;
    return Array.isArray(target) ? target.includes(field) : String(target ?? '').includes(field);
  }
  return false;
}
