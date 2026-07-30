import { SpanStatusCode, trace } from '@opentelemetry/api';

const appTracer = trace.getTracer('arc-api');

export interface ActiveTraceContext {
  [key: string]: string;
  traceId: string;
  spanId: string;
}

export function getAppTracer() {
  return appTracer;
}

export function getActiveTraceContext(): ActiveTraceContext | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();

  if (!spanContext) {
    return undefined;
  }

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

export function setSpanError(span: {
  recordException: (error: Error) => void;
  setStatus: (status: { code: SpanStatusCode; message?: string }) => void;
}, error: unknown): void {
  if (error instanceof Error) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    return;
  }

  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: 'Unknown error',
  });
}
