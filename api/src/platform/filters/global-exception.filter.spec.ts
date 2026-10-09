import type { ArgumentsHost } from '@nestjs/common';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { GlobalExceptionFilter } from './global-exception.filter';

jest.mock('../sentry/sentry', () => ({
  captureException: jest.fn(),
}));

describe('GlobalExceptionFilter', () => {
  it('uses the exception text as the top-level log message and preserves a request summary field', () => {
    const logger = {
      error: jest.fn(),
    };
    const filter = new GlobalExceptionFilter(
      {
        get: () => ({
          requestId: 'req-123',
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
          actorId: undefined,
          actorEmail: undefined,
          sessionId: undefined,
          marketCode: undefined,
          currency: undefined,
          locale: undefined,
          channel: undefined,
        }),
      } as never,
      logger as never,
    );
    const request = {
      method: 'GET',
      url: '/v1/orders/123',
    } as Request;
    const response = createResponse();
    const exception = new Error('Order item is missing unitPriceMinor');

    filter.catch(exception, createArgumentsHost(request, response));

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'http.request.exception',
        errorMessage: 'Order item is missing unitPriceMinor',
        requestSummary: 'GET /v1/orders/123 500',
      }),
      'Order item is missing unitPriceMinor',
    );
  });

  it('emits the public contract for a framework 4xx without legacy envelope fields', () => {
    const logger = { error: jest.fn() };
    const filter = new GlobalExceptionFilter(
      { get: () => ({ requestId: 'req-123' }) } as never,
      logger as never,
    );
    const request = { method: 'GET', url: '/v1/orders/123' } as Request;
    const response = createResponse();
    const exception = new HttpException('bad request', HttpStatus.BAD_REQUEST);

    filter.catch(exception, createArgumentsHost(request, response));

    expect(logger.error).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      status_code: 400,
      code: 'BAD_REQUEST',
      message: 'bad request',
      request_id: 'req-123',
    });
  });

  it('reads only code, message and details and never lets a payload override authoritative metadata', () => {
    const logger = { error: jest.fn() };
    const filter = new GlobalExceptionFilter(
      { get: () => ({ requestId: 'req-authoritative' }) } as never,
      logger as never,
    );
    const request = { method: 'GET', url: '/v1/orders/123' } as Request;
    const response = createResponse();
    const exception = new HttpException(
      {
        code: 'ORDER_NOT_FOUND',
        message: 'Order was not found',
        details: { order_id: 'ord_1' },
        status_code: 999,
        request_id: 'spoofed',
        error: 'Spoofed',
        timestamp: 'spoofed',
        path: '/spoofed',
        legacy_extra: 'dropped',
      },
      HttpStatus.NOT_FOUND,
    );

    filter.catch(exception, createArgumentsHost(request, response));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      status_code: 404,
      code: 'ORDER_NOT_FOUND',
      message: 'Order was not found',
      request_id: 'req-authoritative',
      details: { order_id: 'ord_1' },
    });
  });

  it('keeps unexpected errors safe: 500 with no private diagnostics and no leaked extras', () => {
    const logger = { error: jest.fn() };
    const filter = new GlobalExceptionFilter(
      { get: () => ({ requestId: 'req-500' }) } as never,
      logger as never,
    );
    const request = { method: 'POST', url: '/v1/checkout' } as Request;
    const response = createResponse();
    const exception = new Error('connection string postgres://secret@db failed');

    filter.catch(exception, createArgumentsHost(request, response));

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      status_code: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      request_id: 'req-500',
    });
  });

  it('normalizes a native message array into a single string message', () => {
    const logger = { error: jest.fn() };
    const filter = new GlobalExceptionFilter(
      { get: () => ({}) } as never,
      logger as never,
    );
    const request = { method: 'POST', url: '/v1/auth/login' } as Request;
    const response = createResponse();
    const exception = new BadRequestException({
      message: ['email must be an email', 'password is too short'],
    });

    filter.catch(exception, createArgumentsHost(request, response));

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      status_code: 400,
      code: 'BAD_REQUEST',
      message: 'email must be an email; password is too short',
    });
  });

  it('redacts an InternalServerErrorException 500 even when it carries a message', () => {
    const logger = { error: jest.fn() };
    const filter = new GlobalExceptionFilter(
      { get: () => ({ requestId: 'req-500' }) } as never,
      logger as never,
    );
    const request = { method: 'GET', url: '/v1/orders' } as Request;
    const response = createResponse();
    const exception = new InternalServerErrorException(
      'PRIVATE_DB: connection refused at 10.0.0.5',
    );

    filter.catch(exception, createArgumentsHost(request, response));

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      status_code: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      request_id: 'req-500',
    });
  });

  it('preserves an authored 503 payload only when a public code is present', () => {
    const logger = { error: jest.fn() };
    const filter = new GlobalExceptionFilter(
      { get: () => ({}) } as never,
      logger as never,
    );
    const request = { method: 'POST', url: '/v1/ai/generate' } as Request;

    const authored = createResponse();
    filter.catch(
      new ServiceUnavailableException({
        code: 'AI_UNAVAILABLE',
        message: 'Text generation is temporarily unavailable.',
      }),
      createArgumentsHost(request, authored),
    );
    expect(authored.status).toHaveBeenCalledWith(503);
    expect(authored.json).toHaveBeenCalledWith({
      status_code: 503,
      code: 'AI_UNAVAILABLE',
      message: 'Text generation is temporarily unavailable.',
    });

    const unspecified = createResponse();
    filter.catch(
      new ServiceUnavailableException('APP_BASE_URL must be configured for Stripe'),
      createArgumentsHost(request, unspecified),
    );
    expect(unspecified.status).toHaveBeenCalledWith(503);
    expect(unspecified.json).toHaveBeenCalledWith({
      status_code: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Service Unavailable',
    });
  });
});

function createArgumentsHost(
  request: Request,
  response: Response,
): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ArgumentsHost;
}

function createResponse(): Response {
  return {
    headersSent: false,
    writableEnded: false,
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    end: jest.fn(),
  } as unknown as Response;
}
