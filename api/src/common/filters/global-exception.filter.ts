import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

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

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} failed with ${statusCode}`,
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
