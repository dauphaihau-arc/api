import * as Sentry from '@sentry/nestjs';

let sentryInitialized = false;

export function initializeSentry(runtime: 'api' | 'worker'): void {
  if (sentryInitialized) {
    return;
  }

  const dsn = process.env.SENTRY_DSN?.trim();

  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    enabled: (process.env.SENTRY_ENABLED ?? 'true') === 'true',
    environment:
      process.env.SENTRY_ENVIRONMENT?.trim()
      || process.env.NODE_ENV
      || 'development',
    release: process.env.SENTRY_RELEASE?.trim() || undefined,
    tracesSampleRate: Number(
      process.env.SENTRY_TRACES_SAMPLE_RATE ??
      (process.env.NODE_ENV === 'production' ? '0' : '0')
    ),
    sendDefaultPii: false,
    initialScope: {
      tags: {
        runtime,
        service: 'arc-api',
      },
    },
  });

  sentryInitialized = true;
}

export function captureException(
  exception: unknown,
  configureScope?: (scope: Sentry.Scope) => void
): string {
  if (!configureScope) {
    return Sentry.captureException(exception);
  }

  return Sentry.withScope((scope) => {
    configureScope(scope);
    return Sentry.captureException(exception);
  });
}
