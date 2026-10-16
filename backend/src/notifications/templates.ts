import { NotificationEvent } from '@prisma/client';
import { DateTime } from 'luxon';

export interface TemplateData {
  businessName: string;
  customerName?: string | null;
  serviceName?: string | null;
  staffName?: string | null;
  startsAt: string;
  timezone: string;
  url?: string | null;
}

type Locale = 'es' | 'en' | 'pt';

const T: Record<Locale, Record<NotificationEvent, { subject: string; body: string }>> = {
  es: {
    BOOKING_CONFIRMED: { subject: 'Reserva confirmada en {business}', body: 'Hola {customer}, tu cita de {service} con {staff} en {business} está confirmada para el {when}. Gestiona tu cita: {url}' },
    BOOKING_CANCELED: { subject: 'Reserva cancelada en {business}', body: 'Hola {customer}, tu cita de {service} del {when} en {business} fue cancelada.' },
    BOOKING_RESCHEDULED: { subject: 'Reserva reprogramada en {business}', body: 'Hola {customer}, tu cita de {service} en {business} ahora es el {when}. {url}' },
    REMINDER: { subject: 'Recordatorio de tu cita en {business}', body: 'Hola {customer}, te recordamos tu cita de {service} con {staff} el {when} en {business}. {url}' },
    FEEDBACK_INVITATION: { subject: '¿Cómo te fue en {business}?', body: 'Hola {customer}, gracias por visitarnos. ¿Nos cuentas cómo estuvo tu experiencia? Toma menos de un minuto: {url}' },
  },
  en: {
    BOOKING_CONFIRMED: { subject: 'Booking confirmed at {business}', body: 'Hi {customer}, your {service} appointment with {staff} at {business} is confirmed for {when}. Manage it here: {url}' },
    BOOKING_CANCELED: { subject: 'Booking canceled at {business}', body: 'Hi {customer}, your {service} appointment on {when} at {business} was canceled.' },
    BOOKING_RESCHEDULED: { subject: 'Booking rescheduled at {business}', body: 'Hi {customer}, your {service} appointment at {business} is now on {when}. {url}' },
    REMINDER: { subject: 'Reminder: your appointment at {business}', body: 'Hi {customer}, this is a reminder of your {service} appointment with {staff} on {when} at {business}. {url}' },
    FEEDBACK_INVITATION: { subject: 'How was your visit to {business}?', body: 'Hi {customer}, thanks for visiting. Tell us how it went — it takes less than a minute: {url}' },
  },
  pt: {
    BOOKING_CONFIRMED: { subject: 'Reserva confirmada em {business}', body: 'Olá {customer}, seu horário de {service} com {staff} em {business} está confirmado para {when}. Gerencie aqui: {url}' },
    BOOKING_CANCELED: { subject: 'Reserva cancelada em {business}', body: 'Olá {customer}, seu horário de {service} em {when} em {business} foi cancelado.' },
    BOOKING_RESCHEDULED: { subject: 'Reserva remarcada em {business}', body: 'Olá {customer}, seu horário de {service} em {business} agora é {when}. {url}' },
    REMINDER: { subject: 'Lembrete do seu horário em {business}', body: 'Olá {customer}, lembramos do seu horário de {service} com {staff} em {when} em {business}. {url}' },
    FEEDBACK_INVITATION: { subject: 'Como foi sua visita a {business}?', body: 'Olá {customer}, obrigado pela visita. Conte como foi sua experiência — leva menos de um minuto: {url}' },
  },
};

export function normalizeLocale(locale: string | null | undefined): Locale {
  const base = (locale ?? 'es').slice(0, 2).toLowerCase();
  return base === 'en' || base === 'pt' ? base : 'es';
}

export function formatWhen(iso: string, timezone: string, locale: string) {
  return DateTime.fromISO(iso, { zone: timezone })
    .setLocale(normalizeLocale(locale))
    .toLocaleString(DateTime.DATETIME_MED_WITH_WEEKDAY);
}

export function render(event: NotificationEvent, locale: string, d: TemplateData) {
  const loc = normalizeLocale(locale);
  const tpl = T[loc][event];
  const when = formatWhen(d.startsAt, d.timezone, loc);
  const vars: Record<string, string> = {
    business: d.businessName,
    customer: d.customerName ?? '',
    service: d.serviceName ?? '',
    staff: d.staffName ?? '',
    when,
    url: d.url ?? '',
  };
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '').replace(/\s+\./g, '.').trim();
  // Orden fijo de parámetros para plantillas de WhatsApp: {{1}} cliente, {{2}} negocio, {{3}} servicio, {{4}} fecha, {{5}} enlace.
  const templateParams = [vars.customer, vars.business, vars.service, when, vars.url].map((v) => v || '-');
  return { subject: fill(tpl.subject), text: fill(tpl.body), templateParams };
}
