-- La política de retención elimina clientes antiguos y deja sus citas anónimas,
-- por lo que una cita ONLINE ya no exige cliente (sí servicio).
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_online_fields_chk";
ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_online_fields_chk" CHECK ("type" <> 'ONLINE' OR "serviceId" IS NOT NULL);
