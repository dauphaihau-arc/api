import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { captureException } from '../sentry/sentry';
import { RequestContextService } from '~/modules/shared/request-context/request-context.service';
import { getActiveTraceContext } from '~/modules/shared/observability/tracing';
import { buildStructuredLog } from '../utils/structured-log';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly requestContextService: RequestContextService,
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response | undefined>();
    const request = context.getRequest<Request | undefined>();

    if (!response || !request) {
      throw exception;
    }

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const responseBody = buildErrorResponse(exception, statusCode, request.url);
    const requestContext = this.requestContextService.get();
    const traceContext = getActiveTraceContext();

    if (requestContext.requestId && !response.headersSent) {
      response.setHeader('X-Request-Id', requestContext.requestId);
    }

    if (statusCode >= 500) {
      const errorMessage = exception instanceof Error
        ? exception.message
        : 'Unknown error';

      captureException(exception, (scope) => {
        scope.setTag('runtime', 'api');
        scope.setTag('request_id', requestContext.requestId ?? 'unknown');
        scope.setTag('http.method', request.method);
        scope.setTag('http.path', request.url);
        scope.setTag('http.status_code', String(statusCode));

        if (requestContext.actorId) {
          scope.setUser({
            id: requestContext.actorId,
            email: requestContext.actorEmail,
          });
        }

        scope.setContext('request', {
          method: request.method,
          path: request.url,
          statusCode,
          requestId: requestContext.requestId,
          traceId: traceContext?.traceId,
          spanId: traceContext?.spanId,
        });
      });

      this.logger.error(
        {
          ...buildStructuredLog({
            context: GlobalExceptionFilter.name,
            event: 'http.request.exception',
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
            errorName: exception instanceof Error ? exception.name : 'UnknownError',
            errorMessage,
            requestSummary: buildRequestSummary(request.method, request.url, statusCode),
            traceId: traceContext?.traceId,
            spanId: traceContext?.spanId,
            http: {
              method: request.method,
              path: request.url,
              statusCode,
              ipAddress: requestContext.ipAddress,
              userAgent: requestContext.userAgent,
            },
          }),
          err: exception instanceof Error ? exception : undefined,
        },
        errorMessage,
      );
    }

    if (response.headersSent || response.writableEnded) {
      if (!response.writableEnded) {
        response.end();
      }

      return;
    }

    response.status(statusCode).json(responseBody);
  }
}

function buildRequestSummary(
  method: string,
  path: string,
  statusCode: number,
): string {
  return `${method.toUpperCase()} ${path} ${statusCode}`;
}

function buildErrorResponse(
  exception: unknown,
  statusCode: number,
  path: string,
) {
  const baseResponse = {
    statusCode,
    timestamp: new Date().toISOString(),
    path,
  };

  if (!(exception instanceof HttpException)) {
    return {
      ...baseResponse,
      error: 'Internal Server Error',
      message: 'Internal server error',
    };
  }

  const exceptionResponse = exception.getResponse();

  if (typeof exceptionResponse === 'string') {
    return {
      ...baseResponse,
      error: exception.name,
      message: exceptionResponse,
    };
  }

  if (
    exceptionResponse
    && typeof exceptionResponse === 'object'
    && !Array.isArray(exceptionResponse)
  ) {
    const responsePayload = exceptionResponse as Record<string, unknown>;
    const {
      error,
      message,
      ...extraPayload
    } = responsePayload;

    return {
      ...baseResponse,
      error:
        typeof error === 'string'
          ? error
          : exception.name,
      message:
        typeof message === 'string'
        || Array.isArray(message)
          ? message
          : exception.message,
      ...extraPayload,
    };
  }

  return {
    ...baseResponse,
    error: exception.name,
    message: exception.message,
  };
}
