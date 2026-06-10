import {
  HttpException,
  HttpStatus,
  type CallHandler,
  type ExecutionContext
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { lastValueFrom, throwError } from 'rxjs';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

describe('RequestLoggingInterceptor', () => {
  const baseRequestContext = {
    requestId: 'req-123',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    marketCode: undefined,
    currency: undefined,
    locale: undefined,
    channel: undefined,
    actorId: undefined,
    actorEmail: undefined,
    sessionId: undefined,
  };

  it('logs 5xx request failures at error level with the derived exception status', async () => {
    const recordHttpRequest = jest.fn();
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const interceptor = new RequestLoggingInterceptor(
      {
        get: () => baseRequestContext,
      } as never,
      {
        recordHttpRequest,
      } as never,
      logger as never
    );
    const request = createRequest();
    const response = createResponse();
    const exception = new Error('boom');

    await expect(
      lastValueFrom(
        interceptor.intercept(
          createExecutionContext(request, response),
          createCallHandler(exception)
        )
      )
    ).rejects.toThrow('boom');

    expect(recordHttpRequest).toHaveBeenCalledWith(
      'GET',
      '/v1/orders/:id',
      500,
      expect.any(Number)
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'http.request.failed',
        http: expect.objectContaining({
          statusCode: 500,
          route: '/v1/orders/:id',
        }),
      }),
      expect.stringContaining('500')
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('keeps 4xx request failures at warn level', async () => {
    const recordHttpRequest = jest.fn();
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const interceptor = new RequestLoggingInterceptor(
      {
        get: () => baseRequestContext,
      } as never,
      {
        recordHttpRequest,
      } as never,
      logger as never
    );
    const request = createRequest();
    const response = createResponse();
    const exception = new HttpException('bad request', HttpStatus.BAD_REQUEST);

    await expect(
      lastValueFrom(
        interceptor.intercept(
          createExecutionContext(request, response),
          createCallHandler(exception)
        )
      )
    ).rejects.toThrow('bad request');

    expect(recordHttpRequest).toHaveBeenCalledWith(
      'GET',
      '/v1/orders/:id',
      400,
      expect.any(Number)
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'http.request.failed',
        http: expect.objectContaining({
          statusCode: 400,
        }),
      }),
      expect.stringContaining('400')
    );
    expect(logger.error).not.toHaveBeenCalled();
  });
});

function createExecutionContext(
  request: Request,
  response: Response
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ExecutionContext;
}

function createCallHandler(error: Error): CallHandler {
  return {
    handle: () => throwError(() => error),
  };
}

function createRequest(): Request {
  return {
    method: 'GET',
    url: '/v1/orders/123',
    path: '/v1/orders/123',
    baseUrl: '/v1',
    route: {
      path: '/orders/:id',
    },
    headers: {},
  } as Request;
}

function createResponse(): Response {
  return {
    statusCode: 200,
    setHeader: jest.fn(),
  } as unknown as Response;
}
