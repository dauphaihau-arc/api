import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RequestContextService } from '~/modules/shared/request-context/request-context.service';
import { buildStructuredLog } from '../utils/structured-log';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(
    private readonly requestContextService: RequestContextService
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

    if (requestContext.requestId) {
      response.setHeader('X-Request-Id', requestContext.requestId);
    }

    if (statusCode >= 500) {
      this.logger.error(
        buildStructuredLog({
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
          errorMessage:
            exception instanceof Error
              ? exception.message
              : 'Unknown error',
          http: {
            method: request.method,
            path: request.url,
            statusCode,
            ipAddress: requestContext.ipAddress,
            userAgent: requestContext.userAgent,
          },
        }),
        exception instanceof Error ? exception.stack : undefined
      );
    }

    response.status(statusCode).json(responseBody);
  }
}

function buildErrorResponse(
  exception: unknown,
  statusCode: number,
  path: string
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
