# Seguridad, privacidad y retención

## Autenticación y sesiones
- Las contraseñas usan **argon2id** (m=19 MiB, t=2, p=1, según OWASP), con 10 caracteres como mínimo y sin reglas de composición (NIST 800-63B).
- El token de acceso es un JWT de 15 minutos, firmado con `JWT_ACCESS_SECRET` y con `issuer` y `audience`. Vive en memoria en el navegador.
- El refresh token es opaco, de 384 bits, y se guarda solo como hash SHA-256. Viaja en una cookie `httpOnly; SameSite=Strict; Path=/api/auth` (`Secure` en producción). Rota en cada uso; si se reutiliza, se revoca toda la familia.
- Login con correo inexistente: se verifica contra un hash ficticio para igualar los tiempos y evitar la enumeración de correos.
- Cambiar la contraseña o desactivar a un miembro revoca sus sesiones.

## Autorización
- Un guard global exige token en todas las rutas salvo las marcadas `@Public()`. Seguro por defecto.
- `TenantGuard` exige una membresía activa y aplica el rol con `@Roles()`. Si el negocio está suspendido, queda en solo lectura.
- `STAFF` solo opera su propia agenda, su foto y su portafolio. No ve el dashboard de satisfacción ni la gestión de accesos.
- Super Admin: ver [architecture.md](architecture.md#multi-tenancy). Solo ve datos agregados. Para ver datos personales necesita una **autorización temporal del OWNER** (`SupportAccessGrant`), y cada acceso queda en la auditoría con su motivo.

## Entradas y abuso
- Hay DTOs con `class-validator`, `whitelist` y `forbidNonWhitelisted`: los campos desconocidos se rechazan, lo que impide inyectar `role`, `businessId`, etc.
- Los teléfonos se validan con libphonenumber (metadatos completos) y se guardan en E.164.
- Los colores aceptan solo `#RRGGBB`, también con un CHECK en la base de datos; no se admite CSS arbitrario.
- Límites de peticiones por IP: global de 120/min; reserva pública de 5/min y 20/h; login de 10/min; encuesta, cancelación y reprogramación de 5/min.
- Máximo de reservas activas por teléfono y negocio (`MAX_ACTIVE_BOOKINGS_PER_PHONE`), campo trampa anti-bots y límite mensual del plan.
- **Enumeración:** los enlaces de gestión y de encuesta llevan tokens aleatorios de 256 bits guardados como hash. Se valida el formato antes de consultar. Un token inexistente o caducado devuelve la misma respuesta 404, y los IDs son UUID v4.
- La disponibilidad pública solo expone horarios libres y los IDs de profesionales públicos, nunca datos de otras citas.

## Archivos
- Se valida el **contenido** con sharp, no la extensión: JPEG, PNG, WebP, AVIF y HEIC, sin animaciones y con un máximo de 40 MP y 5 MB.
- Las imágenes se recodifican a WebP sin EXIF/GPS y se redimensionan. Esto neutraliza archivos políglotas.
- Las rutas son `businesses/{businessId}/{tipo}/{uuid}.webp`, y se verifica que el recurso destino pertenezca al tenant **antes** de subir.
- El bucket público solo contiene imágenes que el negocio publica (logo, portada, fotos y portafolio). La clave `service_role` solo vive en el backend.

## Transporte y cabeceras
- Helmet en la API, CORS restringido a `FRONTEND_URL` y cuerpo JSON de 100 KB como máximo.
- En Vercel: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` y `Permissions-Policy`.

## Secretos
- No hay secretos en Git: `.env*` está ignorado, salvo `backend/.env.test`, que solo apunta a una base local efímera con un secreto ficticio.
- La configuración se valida al arrancar y se rechazan las combinaciones inseguras en producción.

## Auditoría
`AuditLog` registra el registro y el login (también los fallidos), los cambios de negocio, servicios, profesionales, horarios y membresías, las transiciones de citas, las acciones del Super Admin, las autorizaciones de soporte y los accesos de soporte.

## Retención de datos (job diario 03:00 UTC)
- Los clientes sin citas en los últimos `DATA_RETENTION_MONTHS` meses (24 por defecto) se eliminan. Sus citas quedan anónimas: sin cliente ni notas.
- Las notificaciones de más de 90 días y los refresh tokens caducados se purgan.
- Tras el envío, los enlaces con token se eliminan del payload de las notificaciones (`[redacted]`).

## Riesgos conocidos / pendientes
- El límite de peticiones está en memoria: hace falta un almacén compartido si se escala horizontalmente.
- No hay recuperación de contraseña por correo; necesita un proveedor de email configurado.
- No hay 2FA para el Super Admin. Es recomendable antes de producción.
- RLS por tenant en PostgreSQL (defensa en profundidad adicional) no está implementado; el aislamiento es de aplicación más FKs compuestas.
- Las políticas legales (privacidad, términos y tratamiento de datos por país) están pendientes de asesoría.
