# Booking SaaS (nombre provisional)

Plataforma SaaS **multi-tenant** de reservas, agendas y satisfacción del cliente para barberías, salones de belleza, estudios de uñas, centros de estética no médica y spas. Está diseñada para ampliarse a otros negocios que trabajan con reservas.

| Experiencia | Ruta | Para quién |
| --- | --- | --- |
| Página pública de reservas | `/b/:slug` | Clientes finales, sin registrarse |
| Gestión de la cita | `/m/:token` | Clientes, con un enlace seguro |
| Encuesta de satisfacción | `/f/:token` | Clientes, tras una cita completada |
| Panel del negocio | `/app/:businessId/...` | Dueños, administradores y profesionales |
| Panel Super Admin | `/admin` | Operador de la plataforma |

> **Estado:** MVP técnico funcional y probado en local. **No está desplegado** y **no está listo para producción** hasta completar los puntos de [docs/deployment.md](docs/deployment.md#checklist-antes-de-producción).

## Stack

- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS 4, React Router 7, TanStack Query, i18next (ES/EN, PT parcial)
- **Backend:** NestJS 11 (monolito modular), Prisma 6, PostgreSQL 16, API REST con validación por DTO
- **Infraestructura prevista:** Supabase (PostgreSQL + Storage), Render (API), Vercel (frontend)
- **Calidad:** ESLint, Prettier, Jest, Vitest, Playwright y GitHub Actions

## Estructura

```
├── backend/          API NestJS (src/<módulo>), pruebas de integración en test/
├── frontend/         SPA React (components, features, pages, hooks, services, i18n, lib)
├── prisma/           schema.prisma, migraciones SQL reproducibles y seed de demostración
├── e2e/              Pruebas Playwright (móvil y escritorio)
├── docs/             Arquitectura, seguridad, despliegue, operación y API
└── .github/          CI
```

La carpeta `prisma/` está en la raíz, como pedía la estructura propuesta. El backend la usa con `--schema ../prisma/schema.prisma`.

## Puesta en marcha local

Requisitos: Node.js 22 y PostgreSQL 16 con la extensión `btree_gist`, que viene incluida en `postgresql-contrib` y en Supabase.

```bash
# 1. Dependencias (npm workspaces)
npm install

# 2. Bases de datos locales
createdb booking            # desarrollo
createdb booking_test       # pruebas de integración (se vacía en cada ejecución)
createdb booking_e2e        # pruebas E2E (se vacía en cada ejecución)

# 3. Configuración
cp backend/.env.example backend/.env       # ajusta DATABASE_URL y JWT_ACCESS_SECRET
cp frontend/.env.example frontend/.env     # opcional

# 4. Cliente Prisma y migraciones
npm run db:generate -w backend
npm run db:deploy

# 5. (Opcional) Datos de DEMOSTRACIÓN: negocio /b/barberia-nova y cuentas demo
npm run db:seed:demo

# 6. Arrancar
npm run dev:backend     # http://localhost:3000/api
npm run dev:frontend    # http://localhost:5173 (con proxy de /api al backend)
```

Cuentas de la demo (solo locales): `demo.owner@example.com` y `demo.superadmin@example.com`, ambas con la contraseña `demo-password-123`. El seed se niega a ejecutarse con `NODE_ENV=production`.

Para conceder el rol de plataforma a un usuario existente (no hay endpoint HTTP para esto):

```bash
npm run admin:grant -w backend -- correo@ejemplo.com
```

## Pruebas

```bash
npm test                 # backend (Jest: unitarias + integración sobre PostgreSQL) + frontend (Vitest)
npm run test:e2e         # Playwright; antes ejecuta: npm run build
npm run lint && npm run typecheck && npm run format:check
```

Resultados de la última ejecución local: backend 67/67, frontend 23/23, E2E 15/15. El detalle está en [docs/testing.md](docs/testing.md).

## Variables de entorno

Están documentadas en [`backend/.env.example`](backend/.env.example) y [`frontend/.env.example`](frontend/.env.example). La configuración se valida al arrancar y el proceso termina si es inválida. En producción se rechazan el almacenamiento local y el modo de notificaciones de desarrollo.

## Documentación

- [Arquitectura y decisiones](docs/architecture.md)
- [Seguridad, privacidad y retención](docs/security.md)
- [Despliegue (Supabase, Render y Vercel)](docs/deployment.md)
- [Operación: copias de seguridad y restauración](docs/operations.md)
- [API REST](docs/api.md)
- [Pruebas](docs/testing.md)

## Licencia

Pendiente de decisión. Mientras tanto, todos los derechos están reservados y el repositorio es privado.
