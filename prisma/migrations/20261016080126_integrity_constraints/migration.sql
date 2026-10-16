-- Restricciones de integridad que Prisma no puede expresar en el esquema.

-- Necesario para combinar igualdad (uuid) y solapamiento de rangos en un índice GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ───────────── Citas / ocupaciones ─────────────

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_time_range_chk" CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT "Appointment_max_duration_chk" CHECK ("endsAt" - "startsAt" <= interval '24 hours'),
  -- Una reserva ONLINE siempre tiene cliente y servicio; un bloqueo nunca tiene cliente ni precio.
  ADD CONSTRAINT "Appointment_online_fields_chk" CHECK (
    "type" <> 'ONLINE' OR ("customerId" IS NOT NULL AND "serviceId" IS NOT NULL)
  ),
  ADD CONSTRAINT "Appointment_blocked_fields_chk" CHECK (
    "type" <> 'BLOCKED' OR ("customerId" IS NULL AND "priceSnapshot" IS NULL AND "blockReason" IS NOT NULL)
  ),
  ADD CONSTRAINT "Appointment_blocked_status_chk" CHECK (
    "type" <> 'BLOCKED' OR "status" IN ('CONFIRMED', 'CANCELED')
  );

-- Garantía central del motor de reservas: un profesional no puede tener dos
-- ocupaciones activas que se solapen. Rango semiabierto [inicio, fin) para que
-- una cita que termina a las 10:00 no choque con otra que empieza a las 10:00.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_no_overlap_excl"
  EXCLUDE USING gist (
    "staffId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE ("status" <> 'CANCELED');

-- ───────────── Horarios ─────────────

ALTER TABLE "WorkingHours"
  ADD CONSTRAINT "WorkingHours_weekday_chk" CHECK ("weekday" BETWEEN 1 AND 7),
  ADD CONSTRAINT "WorkingHours_range_chk" CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute");

ALTER TABLE "RecurringBreak"
  ADD CONSTRAINT "RecurringBreak_weekday_chk" CHECK ("weekday" BETWEEN 1 AND 7),
  ADD CONSTRAINT "RecurringBreak_range_chk" CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute");

ALTER TABLE "ScheduleException"
  ADD CONSTRAINT "ScheduleException_range_chk" CHECK (
    "isClosed" = true
    OR ("startMinute" IS NOT NULL AND "endMinute" IS NOT NULL
        AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute")
  );

ALTER TABLE "StaffTimeOff"
  ADD CONSTRAINT "StaffTimeOff_range_chk" CHECK ("endsAt" > "startsAt");

-- ───────────── Catálogo ─────────────

ALTER TABLE "Service"
  ADD CONSTRAINT "Service_price_chk" CHECK ("price" >= 0),
  ADD CONSTRAINT "Service_duration_chk" CHECK ("durationMinutes" BETWEEN 5 AND 720);

ALTER TABLE "Staff"
  ADD CONSTRAINT "Staff_commission_chk" CHECK ("commissionPercent" IS NULL OR ("commissionPercent" >= 0 AND "commissionPercent" <= 100));

ALTER TABLE "Business"
  ADD CONSTRAINT "Business_slug_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("slug") BETWEEN 3 AND 60),
  ADD CONSTRAINT "Business_color_chk" CHECK ("primaryColor" ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT "Business_currency_chk" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "Business_country_chk" CHECK ("country" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "Business_rules_chk" CHECK (
    "slotIntervalMinutes" BETWEEN 5 AND 120 AND "minLeadMinutes" >= 0
    AND "maxAdvanceDays" BETWEEN 1 AND 365 AND "cancelWindowMinutes" >= 0
  );

-- ───────────── Satisfacción ─────────────

ALTER TABLE "CustomerFeedback"
  ADD CONSTRAINT "CustomerFeedback_rating_chk" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "CustomerFeedback_answer_chk" CHECK (
    "respondedAt" IS NULL OR ("rating" IS NOT NULL AND "wouldReturn" IS NOT NULL)
  );

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_phone_chk" CHECK ("phoneE164" ~ '^\+[1-9][0-9]{6,14}$');

-- ───────────── Supabase Data API ─────────────
-- El backend se conecta con el rol propietario de las tablas (que omite RLS).
-- Activamos RLS sin políticas para que las claves anon/authenticated de Supabase
-- no puedan leer ni escribir ninguna tabla a través de PostgREST.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
