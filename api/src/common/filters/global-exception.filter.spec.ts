import type { ArgumentsHost } from '@nestjs/common';
import {
  HttpException,
  HttpStatus
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
      logger as never
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
      'Order item is missing unitPriceMinor'
    );
  });

  it('returns structured 4xx responses without logging server exceptions', () => {
    const logger = {
      error: jest.fn(),
    };
    const filter = new GlobalExceptionFilter(
      {
        get: () => ({
          requestId: 'req-123',
        }),
      } as never,
      logger as never
    );
    const request = {
      method: 'GET',
      url: '/v1/orders/123',
    } as Request;
    const response = createResponse();
    const exception = new HttpException('bad request', HttpStatus.BAD_REQUEST);

    filter.catch(exception, createArgumentsHost(request, response));

    expect(logger.error).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'HttpException',
        message: 'bad request',
      })
    );
  });
});

function createArgumentsHost(
  request: Request,
  response: Response
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
