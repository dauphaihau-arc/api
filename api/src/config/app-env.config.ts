import { z } from 'zod';

type AppEnv = NodeJS.ProcessEnv;

const positiveIntegerString = z
  .string()
  .trim()
  .regex(/^\d+$/, 'Expected a positive integer value.')
  .refine((value) => Number(value) > 0, 'Expected a positive integer value.');

const appEnvBaseSchema = z.object({
  PORT: positiveIntegerString.default('3000'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .trim()
    .refine(
      (value) =>
        value.length === 0
        || value.split(',').every((segment) => segment.trim().length > 0),
      'Expected a comma-separated list without empty entries.'
    )
    .optional(),
  DATABASE_URL: z.url().optional(),
  DB_HOST: z.string().trim().min(1).optional(),
  DB_PORT: positiveIntegerString.default('5432'),
  DB_USER: z.string().trim().min(1).optional(),
  DB_PASSWORD: z.string().trim().min(1).optional(),
  DB_NAME: z.string().trim().min(1).optional(),
  REDIS_URL: z.url().default('redis://127.0.0.1:6379'),
  CACHE_DRIVER: z.enum(['memory', 'redis']).optional(),
  CACHE_TTL: z.string().trim().min(1).default('60s'),
  QUEUE_DRIVER: z.enum(['inline', 'redis']).optional(),
  QUEUE_NAME: z.string().trim().min(1).default('default'),
  QUEUE_PREFIX: z.string().trim().min(1).default('nest-template'),
  QUEUE_REDIS_URL: z.url().optional(),
  QUEUE_JOB_ATTEMPTS: positiveIntegerString.default('5'),
  QUEUE_JOB_BACKOFF: z.string().trim().min(1).default('5s'),
  QUEUE_REMOVE_COMPLETED_AFTER: z.string().trim().min(1).default('1d'),
  QUEUE_REMOVE_FAILED_AFTER: z.string().trim().min(1).default('7d'),
  QUEUE_WORKER_CONCURRENCY: positiveIntegerString.default('10'),
  JWT_ACCESS_SECRET: z.string().trim().min(1),
  JWT_REFRESH_SECRET: z.string().trim().min(1),
  JWT_ACCESS_TTL: z.string().trim().min(1),
  JWT_REFRESH_TTL: z.string().trim().min(1),
  GUEST_ORDER_TRACKING_SECRET: z.string().trim().min(1).optional(),
  GUEST_ORDER_TRACKING_TTL: z.string().trim().min(1).default('30d'),
  AUTH_COOKIE_ACCESS_NAME: z.string().trim().min(1).default('accessToken'),
  AUTH_COOKIE_REFRESH_NAME: z.string().trim().min(1).default('refreshToken'),
  AUTH_COOKIE_DOMAIN: z.string().trim().optional(),
  AUTH_COOKIE_PATH: z.string().trim().min(1).default('/'),
  AUTH_COOKIE_SAME_SITE: z
    .enum(['strict', 'lax', 'none'])
    .default('lax'),
  AUTH_COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  BCRYPT_SALT_ROUNDS: positiveIntegerString.default('12'),
  RATE_LIMIT_DRIVER: z.enum(['memory', 'redis']).optional(),
  RATE_LIMIT_LIMIT: positiveIntegerString.default('20'),
  RATE_LIMIT_TTL: z.string().trim().min(1).default('60s'),
  RATE_LIMIT_BLOCK_DURATION: z.string().trim().min(1).optional(),
  MAIL_DRIVER: z.enum(['logger', 'resend']).default('logger'),
  MAIL_DEFAULT_FROM_EMAIL: z.email().default('noreply@example.com'),
  MAIL_DEFAULT_FROM_NAME: z.string().trim().min(1).default('Nest Template'),
  RESEND_API_KEY: z.string().trim().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().trim().min(1).optional(),
  STRIPE_WEBHOOK_SECRET_KEY: z.string().trim().min(1).optional(),
  STORAGE_DRIVER: z.enum(['local', 'minio']).default('local'),
  STORAGE_LOCAL_ROOT: z.string().trim().min(1).default('./storage'),
  STORAGE_PUBLIC_BASE_URL: z.url().optional(),
  STORAGE_OBJECT_STORAGE_ENDPOINT: z.url().optional(),
  STORAGE_OBJECT_STORAGE_REGION: z.string().trim().min(1).optional(),
  STORAGE_OBJECT_STORAGE_BUCKET: z.string().trim().min(1).optional(),
  STORAGE_OBJECT_STORAGE_ACCESS_KEY: z.string().trim().min(1).optional(),
  STORAGE_OBJECT_STORAGE_SECRET_KEY: z.string().trim().min(1).optional(),
  STORAGE_OBJECT_STORAGE_FORCE_PATH_STYLE: z.enum(['true', 'false']).optional(),
  STORAGE_MINIO_ENDPOINT: z.url().optional(),
  STORAGE_MINIO_REGION: z.string().trim().min(1).default('us-east-1'),
  STORAGE_MINIO_BUCKET: z.string().trim().min(1).optional(),
  STORAGE_MINIO_ACCESS_KEY: z.string().trim().min(1).optional(),
  STORAGE_MINIO_SECRET_KEY: z.string().trim().min(1).optional(),
  STORAGE_MINIO_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true'),
});

const appEnvSchema = appEnvBaseSchema.superRefine((env, context) => {
  if (
    !env.DATABASE_URL
    && (!env.DB_HOST || !env.DB_USER || !env.DB_PASSWORD || !env.DB_NAME)
  ) {
    for (const field of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const) {
      if (!env[field]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `Expected ${field} when DATABASE_URL is not set.`,
        });
      }
    }
  }

  if (env.MAIL_DRIVER === 'resend' && !env.RESEND_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['RESEND_API_KEY'],
      message: 'Expected RESEND_API_KEY when MAIL_DRIVER is resend.',
    });
  }

  if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['STRIPE_WEBHOOK_SECRET_KEY'],
      message:
        'Expected STRIPE_WEBHOOK_SECRET_KEY when STRIPE_SECRET_KEY is set.',
    });
  }

  if (env.STORAGE_DRIVER === 'minio') {
    const requiredFields = [
      ['STORAGE_OBJECT_STORAGE_ENDPOINT', 'STORAGE_MINIO_ENDPOINT'],
      ['STORAGE_OBJECT_STORAGE_BUCKET', 'STORAGE_MINIO_BUCKET'],
      ['STORAGE_OBJECT_STORAGE_ACCESS_KEY', 'STORAGE_MINIO_ACCESS_KEY'],
      ['STORAGE_OBJECT_STORAGE_SECRET_KEY', 'STORAGE_MINIO_SECRET_KEY'],
    ] as const;

    for (const [preferredField, legacyField] of requiredFields) {
      if (!env[preferredField] && !env[legacyField]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [preferredField],
          message: `Expected ${preferredField} when STORAGE_DRIVER is minio.`,
        });
      }
    }
  }

  if (env.AUTH_COOKIE_SAME_SITE === 'none' && env.AUTH_COOKIE_SECURE !== 'true') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AUTH_COOKIE_SECURE'],
      message:
        'Expected AUTH_COOKIE_SECURE=true when AUTH_COOKIE_SAME_SITE is none.',
    });
  }
});

export function validateAppEnv(env: AppEnv): AppEnv {
  const parsedEnv = appEnvSchema.safeParse(env);

  if (!parsedEnv.success) {
    const issues = parsedEnv.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return {
    ...env,
    ...parsedEnv.data,
  };
}
