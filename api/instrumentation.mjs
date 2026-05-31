import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

const otelEnabled = (process.env.OTEL_ENABLED ?? 'true') === 'true';

if (otelEnabled) {
  const shouldUseConsoleExporter
    = (process.env.OTEL_TRACES_CONSOLE_EXPORTER ?? 'false') === 'true';
  const traceExporter = shouldUseConsoleExporter
    ? new ConsoleSpanExporter()
    : hasOtlpTraceExportConfig()
      ? new OTLPTraceExporter()
      : undefined;

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': process.env.OTEL_SERVICE_NAME ?? 'arc-api',
      'service.version': process.env.npm_package_version ?? '1.0.0',
      'deployment.environment': process.env.SENTRY_ENVIRONMENT
        ?? process.env.NODE_ENV
        ?? 'development',
    }),
    ...(traceExporter ? { traceExporter } : {}),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
      }),
    ],
  });

  sdk.start();

  const shutdown = async () => {
    try {
      await sdk.shutdown();
    }
    catch (error) {
      console.error('Failed to shut down OpenTelemetry SDK', error);
    }
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

function hasOtlpTraceExportConfig() {
  return Boolean(
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
    || process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  );
}
