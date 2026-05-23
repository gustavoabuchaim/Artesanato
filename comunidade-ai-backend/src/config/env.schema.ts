import { z } from 'zod';

export const envSchema = z.object({
  APP_ENV: z.string().default('local'),
  PORT: z.coerce.number().int().positive().default(3005),
  API_PREFIX: z.string().default('api'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),

  COOKIE_DOMAIN: z.string().optional().default(''),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).optional().default('lax'),
  CORS_ORIGINS: z.string().optional().default(''),
  ADMIN_IP_ALLOWLIST: z.string().optional().default(''),

  BCRYPT_COST: z.coerce.number().int().min(12).max(15).default(12),

  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),

  BRUTEFORCE_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60_000),
  BRUTEFORCE_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
  BRUTEFORCE_BASE_BLOCK_MS: z.coerce.number().int().positive().default(5 * 60_000),
  BRUTEFORCE_MAX_BLOCK_MS: z.coerce.number().int().positive().default(60 * 60_000),

  CSP_ENABLED: z.coerce.boolean().optional().default(false),
  CSP_REPORT_ONLY: z.coerce.boolean().optional().default(false),

  R2_ACCOUNT_ID: z.string().optional().default(''),
  R2_ACCESS_KEY_ID: z.string().optional().default(''),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(''),
  R2_BUCKET: z.string().optional().default(''),
  R2_PUBLIC_BASE_URL: z.string().optional().default(''),
  R2_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  UPLOAD_MAX_BYTES_DEFAULT: z.coerce.number().int().positive().default(25 * 1024 * 1024),

  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional().default(''),
  MERCADOPAGO_WEBHOOK_TOKEN: z.string().optional().default(''),
  HOTMART_WEBHOOK_TOKEN: z.string().optional().default(''),

  PANDAVIDEO_API_KEY: z.string().optional().default(''),
  PANDAVIDEO_TUS_ENDPOINT: z.string().optional().default('https://uploader-us01.pandavideo.com.br/files'),
  PANDAVIDEO_FOLDER_ID: z.string().optional().default(''),
  PANDAVIDEO_WEBHOOK_TOKEN: z.string().optional().default(''),

  APP_PUBLIC_URL: z.string().optional().default('http://localhost:3000'),
  SUPPORT_EMAIL: z.string().optional().default(''),
  EMAIL_PROVIDER: z.enum(['resend', 'console']).optional().default('console'),
  EMAIL_FROM: z.string().optional().default(''),
  RESEND_API_KEY: z.string().optional().default(''),

  OUTBOX_ENABLED: z.coerce.boolean().optional().default(true),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(25),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(25).default(8),

  DEFAULT_TENANT_SLUG: z.string().default('default'),
});

export type Env = z.infer<typeof envSchema>;
