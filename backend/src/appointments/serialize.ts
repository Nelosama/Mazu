import { Appointment, Customer, Service, Staff } from '@prisma/client';

type AdminAppointment = Appointment & {
  customer: Customer | null;
  service: Pick<Service, 'id' | 'name' | 'durationMinutes'> | null;
  staff: Pick<Staff, 'id' | 'name'>;
  feedback?: { respondedAt: Date | null; rating: number | null } | null;
};

export function serializeAdminAppointment(a: AdminAppointment) {
  return {
    id: a.id,
    type: a.type,
    status: a.status,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    staff: { id: a.staff.id, name: a.staff.name },
    service: a.service ? { id: a.service.id, name: a.service.name } : null,
    customer: a.customer ? { id: a.customer.id, name: a.customer.name, phone: a.customer.phoneE164 } : null,
    walkInName: a.walkInName,
    blockReason: a.blockReason,
    notes: a.notes,
    price: a.priceSnapshot?.toFixed(2) ?? null,
    currency: a.currency,
    canceledAt: a.canceledAt,
    canceledBy: a.canceledBy,
    completedAt: a.completedAt,
    rescheduleCount: a.rescheduleCount,
    feedback: a.feedback ? { responded: Boolean(a.feedback.respondedAt), rating: a.feedback.rating } : null,
  };
}

export const adminAppointmentInclude = {
  customer: true,
  service: { select: { id: true, name: true, durationMinutes: true } },
  staff: { select: { id: true, name: true } },
  feedback: { select: { respondedAt: true, rating: true } },
} as const;
