# API REST

Base: `/api`. Los errores siguen el formato `{ "error": { "code": "SLOT_UNAVAILABLE", "message": "…", "details"?: {…} } }`. El `code` es estable y el frontend lo traduce.

Autenticación: `Authorization: Bearer <accessToken>`, salvo en las rutas marcadas como públicas.

## Auth
| Método | Ruta | Notas |
| --- | --- | --- |
| POST | `/auth/register` | Pública. Crea un usuario y un negocio (OWNER). Devuelve `accessToken` y la cookie de refresh |
| POST | `/auth/login` | Pública |
| POST | `/auth/refresh` | Pública (usa la cookie). Rota el token |
| POST | `/auth/logout` | Pública |
| GET | `/auth/me` | Usuario, `isPlatformAdmin` y membresías |
| POST | `/auth/change-password` | |

## Negocio (requiere membresía; roles entre corchetes)
| Método | Ruta |
| --- | --- |
| GET / POST | `/businesses` (mis negocios / crear otro) |
| GET / PATCH | `/businesses/:id` [PATCH: OWNER, ADMIN] |
| GET / POST / PATCH | `/businesses/:id/members[/:memberId]` [OWNER, ADMIN] |
| GET / POST / PATCH | `/businesses/:id/branches[/:branchId]` [escritura: OWNER, ADMIN] |
| GET / POST / PATCH | `/businesses/:id/services[/:serviceId]` [escritura: OWNER, ADMIN] |
| GET / POST / PATCH | `/businesses/:id/staff[/:staffId]` [escritura: OWNER, ADMIN] |
| GET / PUT | `/businesses/:id/staff/:staffId/schedule` |
| POST / DELETE | `/businesses/:id/staff/:staffId/exceptions[/:id]` |
| POST / DELETE | `/businesses/:id/staff/:staffId/time-off[/:id]` |
| GET | `/businesses/:id/availability?serviceId&staffId&from&to` (sin antelación mínima) |
| GET | `/businesses/:id/appointments?from&to&staffId` |
| POST | `/businesses/:id/appointments/walk-ins` |
| POST | `/businesses/:id/appointments/blocks` |
| POST | `/businesses/:id/appointments/:apptId/{cancel,complete,no-show,reschedule,feedback-link}` |
| GET / PATCH | `/businesses/:id/feedback[/dashboard \| /:feedbackId]` [OWNER, ADMIN] |
| GET | `/businesses/:id/notifications` [OWNER, ADMIN] |
| POST | `/businesses/:id/media/{logo,cover,staff-photo,service-photo,portfolio}?targetId=` (multipart, `file`) |
| GET / DELETE | `/businesses/:id/media/portfolio[/:itemId]` |
| GET / POST / DELETE | `/businesses/:id/support-grants[/:id]` [OWNER] |

## Públicas (sin sesión, con límite de peticiones)
| Método | Ruta |
| --- | --- |
| GET | `/public/businesses/:slug` |
| GET | `/public/businesses/:slug/availability?serviceId&staffId&from&to` (máx. 31 días) |
| POST | `/public/businesses/:slug/appointments` |
| GET | `/public/manage/:token` |
| GET | `/public/manage/:token/availability?from&to` |
| POST | `/public/manage/:token/cancel` |
| POST | `/public/manage/:token/reschedule` |
| GET / POST | `/public/feedback/:token` |
| GET | `/share/b/:slug` (HTML con metadatos Open Graph) |
| GET | `/health` |

## Super Admin (`PlatformAdmin`)
`GET /admin/metrics`, `GET|POST /admin/businesses`, `PATCH /admin/businesses/:id/status`, `PATCH /admin/businesses/:id/subscription`, `POST /admin/businesses/:id/support/appointments`, `GET|POST|PATCH /admin/plans[/:id]`, `GET /admin/incidents`, `PATCH /admin/incidents/:id/resolve`, `GET /admin/audit`.

### Ejemplo: reserva pública

```http
POST /api/public/businesses/barberia-nova/appointments
Content-Type: application/json

{ "serviceId": "…", "staffId": null, "startsAt": "2026-10-19T16:00:00.000Z",
  "customerName": "María", "customerPhone": "9988-7766", "phoneCountry": "HN",
  "whatsappConsent": true, "website": "" }
```

Responde `201` con la cita y `manageToken`. Esta es la única vez que el token viaja en claro.
