import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RequestContextService } from '~/modules/shared/request-context/request-context.service';
import { ObservabilityService } from '~/modules/shared/observability/observability.service';
import { getActiveTraceContext } from '~/modules/shared/observability/tracing';
import type { StructuredLogRecord } from '../logging/structured-log.types';
import { buildStructuredLog } from '../utils/structured-log';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly requestContextService: RequestContextService,
    private readonly observabilityService: ObservabilityService,
    private readonly logger: PinoLogger
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request | undefined>();
    const response = http.getResponse<Response | undefined>();
    const startedAt = Date.now();

    if (!request || !response) {
      return next.handle();
    }

    const requestContext = this.requestContextService.get();

    if (requestContext.requestId) {
      response.setHeader('X-Request-Id', requestContext.requestId);
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startedAt;

          this.observabilityService.recordHttpRequest(
            request.method,
            this.resolveRoute(request),
            response.statusCode,
            durationMs
          );
          this.logger.info(
            this.buildHttpLogPayload(
              'http.request.completed',
              request,
              response.statusCode,
              durationMs,
              requestContext
            ),
            this.buildHttpSummary(
              request.method,
              this.resolveRoute(request),
              response.statusCode,
              durationMs
            )
          );
        },
        error: () => {
          const durationMs = Date.now() - startedAt;

          this.observabilityService.recordHttpRequest(
            request.method,
            this.resolveRoute(request),
            response.statusCode,
            durationMs
          );
          this.logger.warn(
            this.buildHttpLogPayload(
              'http.request.failed',
              request,
              response.statusCode,
              durationMs,
              requestContext
            ),
            this.buildHttpSummary(
              request.method,
              this.resolveRoute(request),
              response.statusCode,
              durationMs
            )
          );
        },
      })
    );
  }

  private resolveRoute(request: Request): string {
    const routePath = typeof request.route?.path === 'string'
      ? request.route.path
      : request.route?.path instanceof RegExp
        ? request.route.path.toString()
        : undefined;

    if (routePath) {
      const baseUrl = request.baseUrl?.trim();

      return `${baseUrl ?? ''}${routePath}` || request.path;
    }

    return request.path;
  }

  private buildHttpSummary(
    method: string,
    route: string,
    statusCode: number,
    durationMs: number
  ): string {
    return `${method.toUpperCase()} ${route} ${statusCode} ${durationMs}ms`;
  }

  private buildHttpLogPayload(
    event: 'http.request.completed' | 'http.request.failed',
    request: Request,
    statusCode: number,
    durationMs: number,
    requestContext: ReturnType<RequestContextService['get']>
  ): StructuredLogRecord {
    const traceContext = getActiveTraceContext();

    return buildStructuredLog({
      context: RequestLoggingInterceptor.name,
      event,
      requestId: requestContext.requestId,
      actorId: requestContext.actorId,
      actorEmail: requestContext.actorEmail,
      sessionId: requestContext.sessionId,
      traceId: traceContext?.traceId,
      spanId: traceContext?.spanId,
      market: {
        marketCode: requestContext.marketCode,
        currency: requestContext.currency,
        locale: requestContext.locale,
        channel: requestContext.channel,
      },
      http: {
        method: request.method,
        path: request.url,
        route: this.resolveRoute(request),
        statusCode,
        durationMs,
        ipAddress: requestContext.ipAddress,
        userAgent: requestContext.userAgent,
      },
    });
  }
}
