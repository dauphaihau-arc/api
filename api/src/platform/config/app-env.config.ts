import { z } from 'zod';

type AppEnv = NodeJS.ProcessEnv;

const positiveIntegerString = z
  .string()
  .trim()
  .regex(/^\d+$/, 'Expected a positive integer value.')
  .refine((value) => Number(value) > 0, 'Expected a positive integer value.');

const appEnvBaseSchema = z.object({
  PORT: positiveIntegerString.default('3000'),
  LOG_LEVEL: z.string().trim().min(1).default('info'),
  LOG_PRETTY: z.enum(['true', 'false']).default('false'),
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
      'Expected a comma-separated list without empty entries.',
    )
    .optional(),
  DATABASE_URL: z.url().optional(),
  DB_HOST: z.string().trim().min(1).optional(),
  DB_PORT: positiveIntegerString.default('5432'),
  DB_USER: z.string().trim().min(1).optional(),
  DB_PASSWORD: z.string().trim().min(1).optional(),
  DB_NAME: z.string().trim().min(1).optional(),
  CATALOG_STORE_DRIVER: z.enum(['mongodb']).default('mongodb'),
  CATALOG_SEARCH_DRIVER: z.enum(['atlas', 'mongo-basic']).default('atlas'),
  CATALOG_MONGODB_URI: z.url().optional(),
  CATALOG_MONGODB_DB_NAME: z.string().trim().min(1).optional(),
  CATALOG_MONGODB_PRODUCTS_COLLECTION: z.string().trim().min(1).optional(),
  CATALOG_MONGODB_PRICES_COLLECTION: z.string().trim().min(1).optional(),
  CATALOG_MONGODB_SLUGS_COLLECTION: z.string().trim().min(1).optional(),
  CATALOG_MONGODB_SEARCH_COLLECTION: z.string().trim().min(1).optional(),
  STOREFRONT_INDEXED_PRICE_PAIRS: z.string().trim().min(1).optional(),
  STOREFRONT_RARE_PRICE_CACHE_TTL_MS: positiveIntegerString.optional(),
  DB_LOG_QUERIES: z.enum(['true', 'false']).default('false'),
  DB_SLOW_QUERY_THRESHOLD_MS: positiveIntegerString.default('250'),
  REDIS_URL: z.url().default('redis://127.0.0.1:6379'),
  CACHE_DRIVER: z.enum(['memory', 'redis', 'disabled']).optional(),
  CACHE_ENABLED: z.enum(['true', 'false']).default('true'),
  CACHE_TTL: z.string().trim().min(1).default('60s'),
  USER_CACHE_ENABLED: z.enum(['true', 'false']).default('true'),
  STOREFRONT_PUBLIC_RESPONSE_CACHE_ENABLED: z.enum(['true', 'false']).default('true'),
  STOREFRONT_RARE_PRICE_CACHE_ENABLED: z.enum(['true', 'false']).default('true'),
  QUEUE_DRIVER: z.enum(['inline', 'redis']).optional(),
  QUEUE_NAME: z.string().trim().min(1).default('default'),
  QUEUE_PREFIX: z.string().trim().min(1).default('nest-template'),
  QUEUE_REDIS_URL: z.url().optional(),
  QUEUE_JOB_ATTEMPTS: positiveIntegerString.default('5'),
  QUEUE_JOB_BACKOFF: z.string().trim().min(1).default('5s'),
  QUEUE_REMOVE_COMPLETED_AFTER: z.string().trim().min(1).default('1d'),
  QUEUE_REMOVE_FAILED_AFTER: z.string().trim().min(1).default('7d'),
  QUEUE_WORKER_CONCURRENCY: positiveIntegerString.default('10'),
  BULL_BOARD_ENABLED: z.enum(['true', 'false']).default('true'),
  BULL_BOARD_PATH: z.string().trim().min(1).default('/ops/queues'),
  BULL_BOARD_USERNAME: z.string().trim().min(1).optional(),
  BULL_BOARD_PASSWORD: z.string().trim().min(1).optional(),
  OTEL_ENABLED: z.enum(['true', 'false']).default('true'),
  OTEL_SERVICE_NAME: z.string().trim().min(1).default('arc-api'),
  OTEL_TRACES_CONSOLE_EXPORTER: z.enum(['true', 'false']).default('false'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().trim().optional(),
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string().trim().optional(),
  SENTRY_ENABLED: z.enum(['true', 'false']).default('true'),
  SENTRY_DSN: z.string().trim().optional(),
  SENTRY_ENVIRONMENT: z.string().trim().min(1).optional(),
  SENTRY_RELEASE: z.string().trim().min(1).optional(),
  SENTRY_TEST_TRIGGER_SECRET: z.string().trim().min(1).optional(),
  SENTRY_TRACES_SAMPLE_RATE: z
    .string()
    .trim()
    .regex(/^(0(\.\d+)?|1(\.0+)?)$/, 'Expected a number between 0 and 1.')
    .optional(),
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
  WEB_PUSH_SUBJECT: z.string().trim().min(1).optional(),
  WEB_PUSH_PUBLIC_KEY: z.string().trim().min(1).optional(),
  WEB_PUSH_PRIVATE_KEY: z.string().trim().min(1).optional(),
  WEB_PUSH_TTL_SECONDS: positiveIntegerString.default('60'),
  STRIPE_SECRET_KEY: z.string().trim().min(1).optional(),
  STRIPE_WEBHOOK_SECRET_KEY: z.string().trim().min(1).optional(),
  FX_RATE_SYNC_PROVIDER: z
    .enum(['disabled', 'open-exchange-rates'])
    .default('disabled'),
  FX_RATE_SYNC_INTERVAL: z.string().trim().min(1).default('1h'),
  FX_RATE_SYNC_RUN_ON_STARTUP: z.enum(['true', 'false']).default('false'),
  FX_SYNC_TRIGGER_SECRET: z.string().trim().min(1).optional(),
  OPEN_EXCHANGE_RATES_APP_ID: z.string().trim().min(1).optional(),
  OPEN_EXCHANGE_RATES_BASE_URL: z
    .url()
    .default('https://openexchangerates.org/api'),
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  AI_PRODUCT_DESCRIPTION_ENABLED: z.enum(['true', 'false']).default('true'),
  OPENAI_BASE_URL: z.url().default('https://api.openai.com/v1'),
  OPENAI_PRODUCT_DESCRIPTION_MODEL: z
    .string()
    .trim()
    .min(1)
    .default('gpt-5.4-nano'),
  OPENAI_TIMEOUT_MS: positiveIntegerString.default('10000'),
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

  const hasAnyWebPushSetting = Boolean(
    env.WEB_PUSH_SUBJECT
    || env.WEB_PUSH_PUBLIC_KEY
    || env.WEB_PUSH_PRIVATE_KEY,
  );

  if (
    hasAnyWebPushSetting
    && (!env.WEB_PUSH_SUBJECT || !env.WEB_PUSH_PUBLIC_KEY || !env.WEB_PUSH_PRIVATE_KEY)
  ) {
    for (const field of [
      'WEB_PUSH_SUBJECT',
      'WEB_PUSH_PUBLIC_KEY',
      'WEB_PUSH_PRIVATE_KEY',
    ] as const) {
      if (!env[field]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `Expected ${field} when Web Push is configured.`,
        });
      }
    }
  }

  if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['STRIPE_WEBHOOK_SECRET_KEY'],
      message:
        'Expected STRIPE_WEBHOOK_SECRET_KEY when STRIPE_SECRET_KEY is set.',
    });
  }

  if (
    env.FX_RATE_SYNC_PROVIDER === 'open-exchange-rates'
    && !env.OPEN_EXCHANGE_RATES_APP_ID
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPEN_EXCHANGE_RATES_APP_ID'],
      message:
        'Expected OPEN_EXCHANGE_RATES_APP_ID when FX_RATE_SYNC_PROVIDER is open-exchange-rates.',
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

  for (const field of [
    'CATALOG_MONGODB_URI',
    'CATALOG_MONGODB_DB_NAME',
    'CATALOG_MONGODB_PRODUCTS_COLLECTION',
    'CATALOG_MONGODB_PRICES_COLLECTION',
    'CATALOG_MONGODB_SLUGS_COLLECTION',
    'CATALOG_MONGODB_SEARCH_COLLECTION',
  ] as const) {
    if (!env[field]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `Expected ${field} for catalog MongoDB.`,
      });
    }
  }

  if (
    (env.BULL_BOARD_USERNAME && !env.BULL_BOARD_PASSWORD)
    || (!env.BULL_BOARD_USERNAME && env.BULL_BOARD_PASSWORD)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['BULL_BOARD_PASSWORD'],
      message:
        'Expected both BULL_BOARD_USERNAME and BULL_BOARD_PASSWORD when Bull Board auth is configured.',
    });
  }

  if (env.SENTRY_TRACES_SAMPLE_RATE && !env.SENTRY_DSN) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SENTRY_DSN'],
      message: 'Expected SENTRY_DSN when SENTRY_TRACES_SAMPLE_RATE is set.',
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
