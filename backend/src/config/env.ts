import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    // Orígenes permitidos para CORS, separados por comas.
    FRONTEND_URL: z.string().min(1),
    // URL pública desde la que se construyen los enlaces enviados a clientes.
    PUBLIC_APP_URL: z.string().url(),
    TRUST_PROXY: bool,
    COOKIE_SECURE: bool,

    STORAGE_DRIVER: z.enum(['supabase', 'local']).default('local'),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_STORAGE_BUCKET: z.string().default('public-media'),
    UPLOAD_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(5 * 1024 * 1024),
    LOCAL_STORAGE_DIR: z.string().default('.local-storage'),

    NOTIFICATIONS_DEV_LOG: bool,
    NOTIFICATIONS_WORKER_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    EMAIL_PROVIDER: z.enum(['none', 'resend']).default('none'),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    WHATSAPP_PROVIDER: z.enum(['none', 'meta']).default('none'),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_API_VERSION: z.string().default('v21.0'),
    WHATSAPP_TEMPLATE_LANG_FALLBACK: z.string().default('es'),

    DEFAULT_PLAN_CODE: z.string().default('PRO'),
    TRIAL_DAYS: z.coerce.number().int().nonnegative().default(30),
    DATA_RETENTION_MONTHS: z.coerce.number().int().positive().default(24),
    FEEDBACK_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),
    MAX_ACTIVE_BOOKINGS_PER_PHONE: z.coerce.number().int().positive().default(3),
    JOBS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  })
  .superRefine((env, ctx) => {
    if (
      env.STORAGE_DRIVER === 'supabase' &&
      (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'STORAGE_DRIVER=supabase requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY',
      });
    }
    if (env.NODE_ENV === 'production') {
      if (env.STORAGE_DRIVER === 'local') {
        ctx.addIssue({
          code: 'custom',
          message: 'El almacenamiento local no está permitido en producción',
        });
      }
      if (env.NOTIFICATIONS_DEV_LOG) {
        ctx.addIssue({
          code: 'custom',
          message: 'NOTIFICATIONS_DEV_LOG no está permitido en producción',
        });
      }
    }
    if (env.EMAIL_PROVIDER === 'resend' && (!env.RESEND_API_KEY || !env.EMAIL_FROM)) {
      ctx.addIssue({
        code: 'custom',
        message: 'EMAIL_PROVIDER=resend requiere RESEND_API_KEY y EMAIL_FROM',
      });
    }
    if (
      env.WHATSAPP_PROVIDER === 'meta' &&
      (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'WHATSAPP_PROVIDER=meta requiere WHATSAPP_PHONE_NUMBER_ID y WHATSAPP_ACCESS_TOKEN',
      });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `- ${i.path.join('.') || 'env'}: ${i.message}`);
    throw new Error(`Configuración inválida:\n${issues.join('\n')}`);
  }
  return parsed.data;
}

export function env(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}

/** Solo para pruebas. */
export function resetEnvCache() {
  cached = undefined;
}

export function allowedOrigins(): string[] {
  return env()
    .FRONTEND_URL.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
