# Pruebas

| Suite | Herramienta | Dónde | Base de datos |
| --- | --- | --- | --- |
| Unitarias backend | Jest | `backend/src/**/*.spec.ts` | — |
| Integración backend | Jest + supertest | `backend/test/*.int-spec.ts` | PostgreSQL real (`booking_test`) |
| Unitarias/componentes frontend | Vitest + Testing Library | `frontend/src/**/*.test.ts(x)` | — |
| E2E | Playwright (Pixel 7 + Desktop Chrome) | `e2e/tests` | PostgreSQL real (`booking_e2e`) |

Las pruebas de integración y E2E vacían su base de datos y se niegan a correr si la URL no apunta a una base de pruebas.

## Cobertura de los requisitos

| # | Requisito | Prueba(s) |
| --- | --- | --- |
| 1 | Registro de negocio | `auth-tenancy` › registra un negocio… |
| 2 | Aislamiento multi-tenant | `auth-tenancy` › aísla los datos…; la base de datos rechaza referencias cruzadas… |
| 3 | Creación de profesionales | `helpers.setupCatalog` (todas las suites); límites del plan en `admin-plans` |
| 4 | Creación de servicios | ídem; validación de importes |
| 5 | Horarios disponibles | `engine.spec` (12 casos); `booking` › calcula horarios…; descansos, días libres, excepciones y vacaciones |
| 6 | Reservas públicas | `booking` › reserva pública sin cuenta…; E2E `booking-flow` |
| 7 | Dos clientes, mismo horario | `booking` › 12 reservas concurrentes → 1 éxito; restricción de exclusión directa; "cualquier profesional" concurrente |
| 8 | Bloqueos administrativos | `booking` › bloqueos rápidos…; E2E › bloqueo rápido en tres interacciones |
| 9 | Walk-ins | `booking` › …walk-ins…; E2E › walk-in → completar… |
| 10 | Cancelaciones | `booking` › el cliente cancela…; ventana de cancelación; E2E |
| 11 | Reprogramaciones | `booking` › el cliente reprograma…; el administrador reprograma… |
| 12 | Zonas horarias | `engine.spec` (DST EE. UU. y Europa, +05:30); `booking` › Zonas horarias (4 zonas + sucursal con zona distinta); `format.test` |
| 13 | Encuestas | `feedback-notifications` › Encuestas…; E2E |
| 14 | Respuestas duplicadas | 8 envíos concurrentes → 1 registrado |
| 15 | Permisos | `auth-tenancy` › permisos por rol; `admin-plans` › Super Admin |
| 16 | Carga de imágenes | `feedback-notifications` › Carga de imágenes (válida, falsa, demasiado grande, de otro tenant) |
| 17 | Navegación móvil | E2E `mobile-only` (barra inferior, sin desbordamiento horizontal) |
| 18 | Flujo completo de reserva | E2E `booking-flow` + `admin-flow` (reserva → gestión → cancelación; walk-in → completar → encuesta → dashboard) |

## Última ejecución local (2026-10-16)

- Backend: **67/67** (6 suites)
- Frontend: **23/23** (5 archivos)
- E2E: **15/15** (2 proyectos)
- `lint`, `typecheck`, `format:check`: sin errores

En CI (`.github/workflows/ci.yml`) estas mismas suites corren con un servicio `postgres:16`. La ejecución [#2](https://github.com/Nelosama/Mazu/actions/runs/38876834396) pasó en verde sus 4 jobs: calidad, backend, frontend y E2E.
