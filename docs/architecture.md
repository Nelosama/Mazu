# Arquitectura

## Visión general

```
Navegador ──► Vercel (SPA estática)
                 │  rewrites /api/* y /share/*  (mismo origen → cookies first-party)
                 ▼
             Render: API NestJS (monolito modular)
                 │  Prisma
                 ▼
             Supabase: PostgreSQL 16  +  Storage (bucket público de imágenes)
```

El frontend llama siempre a `/api/...` en su propio origen. En desarrollo, Vite hace de proxy. En producción lo hacen los *rewrites* de `frontend/vercel.json`. Así el refresh token puede vivir en una cookie `httpOnly; SameSite=Strict`, sin depender de cookies de terceros, que Safari y Chrome bloquean cada vez más.

## Módulos del backend (`backend/src`)

| Módulo | Responsabilidad |
| --- | --- |
| `auth` | Registro, login, rotación de refresh tokens, guards `JwtAuthGuard` (global), `TenantGuard` y `PlatformAdminGuard` |
| `businesses` | Negocios (tenants), membresías y roles |
| `branches` | Sucursales, cada una con su zona horaria IANA |
| `staff` | Profesionales, horario semanal, descansos, excepciones y vacaciones |
| `services` | Catálogo de servicios (importes `Decimal`) |
| `availability` | Motor de disponibilidad: `engine.ts` contiene funciones puras y el servicio carga los datos |
| `appointments` | Reservas públicas, walk-ins, bloqueos y transiciones de estado |
| `public` | Endpoints sin sesión (perfil, disponibilidad, reserva, gestión, encuesta) y página OG `/api/share/b/:slug` |
| `feedback` | Encuestas, dashboard y seguimiento |
| `notifications` | Outbox, worker, recordatorios y adaptadores (WhatsApp Cloud API, Resend, dev-log) |
| `subscriptions` | Planes, características y límites |
| `storage` | Subida y procesamiento de imágenes (sharp) y adaptadores (Supabase, local de desarrollo) |
| `admin` | Super Admin, incidencias, acceso de soporte auditado y job de retención |
| `audit` | Registro de auditoría |

Se descartaron los microservicios, Redis y las colas externas. Los trabajos en segundo plano (envío de notificaciones, recordatorios y retención) corren dentro del proceso con `@nestjs/schedule`. El worker reclama filas con `FOR UPDATE SKIP LOCKED`, de modo que es seguro aunque haya varias instancias.

## Multi-tenancy

- Cada entidad del negocio lleva `businessId`.
- **Integridad en la base de datos:** las relaciones entre entidades de un mismo tenant usan claves foráneas compuestas `(id, businessId)`. Por ejemplo, `StaffService(staffId, businessId) → Staff(id, businessId)`. PostgreSQL rechaza asociar un profesional de A con un servicio de B aunque un bug de la aplicación lo intente, y hay una prueba que lo verifica.
- **En la aplicación:** `TenantGuard` resuelve `:businessId`, exige una membresía activa y responde 404 en vez de 403 para no revelar qué negocios existen. Todas las consultas filtran por `businessId`.
- **Supabase Data API:** RLS está activado sin políticas en todas las tablas, así que las claves `anon` y `authenticated` no pueden leer nada. El backend usa el rol propietario.
- **Super Admin:** se define en la tabla `PlatformAdmin`, separada de las membresías, y no la modifica ningún endpoint. Solo se concede por CLI (`npm run admin:grant`).

## Motor de disponibilidad

1. Para una fecha local, usa los tramos de una **excepción** si la hay (cerrado u horario especial). Si no, usa el **horario semanal** menos los **descansos**.
2. Convierte los tramos a instantes UTC por **hora de pared** (Luxon). Así, "09:00–18:00" sigue siendo 09:00–18:00 locales tras un cambio de horario de verano.
3. Resta las ocupaciones: citas no canceladas (incluidos walk-ins y bloqueos) y vacaciones.
4. Genera inicios con el paso configurado (`slotIntervalMinutes`) donde cabe la duración completa, respetando la antelación mínima y la máxima.

Todos los intervalos son semiabiertos `[inicio, fin)`. Las pruebas unitarias cubren los cambios de horario en EE. UU. y Europa, y zonas con desfase de 30 minutos.

### Garantía contra solapamientos

```sql
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_no_overlap_excl"
  EXCLUDE USING gist ("staffId" WITH =, tstzrange("startsAt","endsAt",'[)') WITH &&)
  WHERE ("status" <> 'CANCELED');
```

La API valida la disponibilidad dentro de la transacción, pero la garantía final la da PostgreSQL. Si dos reservas compiten, la segunda recibe `23P01` y la API responde `409 SLOT_UNAVAILABLE`. Con "cualquier profesional", la API prueba el siguiente profesional libre. Las pruebas lanzan 12 reservas simultáneas: una sola tiene éxito.

## Decisiones y supuestos

| Decisión | Motivo |
| --- | --- |
| Repositorio `Nelosama/Mazu` en lugar de `booking-saas` | La integración de GitHub no tiene permiso para crear repositorios (403). Ver el README. |
| `prisma/` en la raíz | Se respeta la estructura propuesta; el backend la referencia con `--schema`. |
| Moneda en `Business`, no en `Service` | Evita servicios en monedas distintas dentro de un negocio. Cada cita guarda `priceSnapshot` y `currency`. |
| Roles de tenant `OWNER/ADMIN/STAFF` y plataforma `SUPER_ADMIN` | El Super Admin no puede asignarse desde un tenant. |
| Access token en memoria y refresh token en cookie httpOnly con rotación | Evita guardar tokens en `localStorage`; la reutilización de un refresh token revoca toda la familia. |
| Límite de peticiones en memoria (`@nestjs/throttler`) | Basta con una instancia. Con varias instancias hará falta un almacén compartido; el límite por teléfono ya vive en la base de datos. |
| Notificaciones: WhatsApp al cliente y email al negocio | El correo del cliente no es obligatorio. WhatsApp exige consentimiento y plantillas aprobadas, y cuesta dinero. |
| Encuestas privadas, categorías por palabras clave | No hay IA de pago en el MVP. |
| Plan por defecto PRO en prueba (`DEFAULT_PLAN_CODE`, `TRIAL_DAYS`) | Permite usar todo el flujo. No hay cobro real activo. |
| Descansos recurrentes solo con el horario semanal | Una excepción define el horario completo de ese día. |
| Portugués parcial | El recorrido del cliente está traducido; el panel cae al inglés. |
