import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RequestContextService } from '~/modules/shared/request-context/request-context.service';
import { buildStructuredLog } from '../utils/structured-log';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  constructor(
    private readonly requestContextService: RequestContextService
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
          this.logger.log(this.buildHttpLogPayload(
            'http.request.completed',
            request,
            response.statusCode,
            Date.now() - startedAt,
            requestContext
          ));
        },
        error: () => {
          this.logger.warn(this.buildHttpLogPayload(
            'http.request.failed',
            request,
            response.statusCode,
            Date.now() - startedAt,
            requestContext
          ));
        },
      })
    );
  }

  private buildHttpLogPayload(
    event: 'http.request.completed' | 'http.request.failed',
    request: Request,
    statusCode: number,
    durationMs: number,
    requestContext: ReturnType<RequestContextService['get']>
  ): string {
    return buildStructuredLog({
      event,
      requestId: requestContext.requestId,
      actorId: requestContext.actorId,
      actorEmail: requestContext.actorEmail,
      sessionId: requestContext.sessionId,
      market: {
        marketCode: requestContext.marketCode,
        currency: requestContext.currency,
        locale: requestContext.locale,
        channel: requestContext.channel,
      },
      http: {
        method: request.method,
        path: request.url,
        statusCode,
        durationMs,
        ipAddress: requestContext.ipAddress,
        userAgent: requestContext.userAgent,
      },
    });
  }
}
