-- Planes SaaS de referencia. Los precios son configurables desde el panel Super Admin;
-- no hay cobro real activo hasta definir proveedor y jurisdicción de facturación.
INSERT INTO "Plan" ("id", "code", "name", "description", "monthlyPrice", "currency", "maxStaff", "maxBranches",
                    "maxMonthlyBookings", "customBranding", "satisfactionReports", "advancedReports", "sortOrder", "updatedAt")
VALUES
  (gen_random_uuid(), 'STARTER',  'Starter',  'Un profesional y página pública de reservas.', 0.00, 'USD', 1, 1, 150, false, false, false, 1, now()),
  (gen_random_uuid(), 'PRO',      'Pro',      'Más profesionales, personalización y reportes de satisfacción.', 0.00, 'USD', 10, 1, NULL, true, true, false, 2, now()),
  (gen_random_uuid(), 'BUSINESS', 'Business', 'Multisucursal, más profesionales y reportes avanzados.', 0.00, 'USD', 50, 10, NULL, true, true, true, 3, now())
ON CONFLICT ("code") DO NOTHING;
