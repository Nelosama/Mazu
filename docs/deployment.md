# Despliegue

> El despliegue público **requiere autorización expresa**. Nada de lo descrito aquí se ha ejecutado. Crear servicios en Supabase, Render o Vercel puede generar costos.

## 1. Supabase (PostgreSQL + Storage)

1. Crea el proyecto. Elige una región cercana a tus usuarios; para Latinoamérica, `sa-east-1` o `us-east-1`.
2. Activa la extensión `btree_gist` en *Database → Extensions*. La migración también la crea con `CREATE EXTENSION IF NOT EXISTS`.
3. Configura las cadenas de conexión:
   - `DATABASE_URL`: pooler en modo transacción (puerto 6543) con `?pgbouncer=true&connection_limit=5`.
   - `DIRECT_DATABASE_URL`: conexión directa (puerto 5432), usada por las migraciones.
4. En Storage, crea el bucket **público** `public-media`, solo para imágenes que los negocios publican. Opcionalmente, limita los tipos MIME a `image/webp` y el tamaño a 5 MB.
5. Copia `SUPABASE_URL` y la clave `service_role`. Esa clave va **solo** en Render y nunca en Vercel ni en el navegador.
6. Las migraciones activan RLS sin políticas en todas las tablas: la Data API de Supabase queda cerrada para `anon` y `authenticated`.

## 2. Render (API)

1. Crea el servicio desde `render.yaml`, que trae `autoDeploy: false`, o manualmente:
   - Build: `npm ci && npm run db:generate -w backend && npm run build -w backend`
   - Pre-deploy: `npm run db:deploy -w backend`
   - Start: `npm run start -w backend`
   - Health check: `/api/health`
2. Variables: las de `backend/.env.example`, con `NODE_ENV=production`, `TRUST_PROXY=true`, `STORAGE_DRIVER=supabase` y `NOTIFICATIONS_DEV_LOG=false`. `FRONTEND_URL` y `PUBLIC_APP_URL` deben ser el dominio de Vercel.
3. Plan: el plan gratuito suspende el servicio tras inactividad, lo que detiene el worker de notificaciones y los recordatorios. Para producción se recomienda un plan con instancia siempre activa.
4. Crea el primer Super Admin: regístrate desde la web y ejecuta `npm run admin:grant -w backend -- tu@correo` desde el *Shell* de Render.

## 3. Vercel (frontend)

1. Importa el repositorio con *Root directory* `frontend`, *Build* `npm run build` y *Output* `dist`.
2. **Edita `frontend/vercel.json`** y sustituye `REEMPLAZAR-API.onrender.com` por el host real de la API. Los rewrites de `/api/*` y `/share/*` mantienen todo en el mismo origen.
3. Variables públicas (opcionales): `VITE_PRODUCT_NAME`.

## 4. Notificaciones (opcional; tienen costo)

- **WhatsApp (Meta Cloud API):** necesitas una cuenta de WhatsApp Business verificada, un número y estas plantillas **aprobadas** en cada idioma: `booking_confirmed`, `booking_canceled`, `booking_rescheduled`, `appointment_reminder` y `feedback_invitation`. Sus parámetros son `{{1}}` cliente, `{{2}}` negocio, `{{3}}` servicio, `{{4}}` fecha y `{{5}}` enlace. Meta cobra por conversación según el país del destinatario. Variables: `WHATSAPP_PROVIDER=meta`, `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_ACCESS_TOKEN`.
- **Email (Resend):** necesitas un dominio verificado. Variables: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` y `EMAIL_FROM`.
- Sin proveedores, las notificaciones quedan como `SKIPPED_NO_PROVIDER`: **no** se simulan envíos. Mientras tanto, el panel ofrece compartir el enlace de la encuesta con un botón que abre WhatsApp (`wa.me`) y la persona decide si envía el mensaje.

## Checklist antes de producción

- [ ] Autorización de despliegue y del gasto asociado.
- [ ] Dominio propio y HTTPS en Vercel; `FRONTEND_URL` y `PUBLIC_APP_URL` actualizadas.
- [ ] `JWT_ACCESS_SECRET` aleatorio (≥ 48 bytes) y secretos solo en los paneles de Render y Vercel.
- [ ] Copias de seguridad verificadas con un simulacro de restauración ([operations.md](operations.md)).
- [ ] Proveedor de email (recuperación de contraseña, pendiente de implementar) y, si aplica, de WhatsApp.
- [ ] 2FA para cuentas Super Admin.
- [ ] Textos legales: privacidad, términos y tratamiento de datos según cada país.
- [ ] Límite de peticiones con un almacén compartido si hay más de una instancia.
- [ ] Monitor externo de disponibilidad y alertas.
- [ ] Decidir proveedor y modelo de facturación antes de activar cobros.
