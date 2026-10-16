# Operación: copias de seguridad y restauración

## Copias de seguridad

1. **Supabase (principal):** los planes de pago incluyen copias diarias. La recuperación a un punto en el tiempo (PITR) es un complemento. Comprueba qué incluye el plan contratado antes de producción.
2. **Copia lógica independiente** (recomendada, semanal como mínimo, guardada fuera de Supabase):

```bash
# Usa la conexión directa (puerto 5432), no el pooler.
pg_dump "$DIRECT_DATABASE_URL" --format=custom --no-owner --no-privileges \
  --file="booking-$(date +%F).dump"
```

3. **Imágenes:** Supabase Storage no está incluido en `pg_dump`. Sincroniza el bucket periódicamente con la API S3-compatible de Supabase (por ejemplo, `rclone sync`).

Cifra las copias y limita su acceso: contienen datos personales (nombres y teléfonos).

## Restauración (simulacro recomendado cada trimestre)

```bash
createdb booking_restore
pg_restore --no-owner --dbname=booking_restore booking-YYYY-MM-DD.dump
# Verificación mínima
psql booking_restore -c 'SELECT count(*) FROM "Business";'
psql booking_restore -c "SELECT conname FROM pg_constraint WHERE conname = 'Appointment_no_overlap_excl';"
```

Para restaurar sobre producción: pon la API en mantenimiento (detén el servicio en Render), restaura en una base nueva, apunta `DATABASE_URL` y `DIRECT_DATABASE_URL` a ella y vuelve a arrancar. **Nunca** ejecutes `prisma migrate reset` contra producción.

## Migraciones

- Las migraciones son SQL versionado en `prisma/migrations`. Se aplican con `npm run db:deploy` (`prisma migrate deploy`). En Render se ejecutan en `preDeployCommand`.
- Las restricciones que Prisma no modela (exclusión GiST, CHECKs y RLS) viven en migraciones SQL escritas a mano. **No** uses `prisma db push` en entornos compartidos: no aplica esas migraciones.

## Monitorización

- Health check: `GET /api/health` (consulta la base de datos).
- Incidencias: los errores 5xx y los fallos definitivos de notificación se agrupan por huella en `SystemIncident`, visible en el Super Admin, pestaña "Incidencias".
- Recomendado: un monitor externo de disponibilidad y la recolección de logs de Render.
