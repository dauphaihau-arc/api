import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CartExceptionsFilter } from '~/domains/cart/api/rest/errors/cart-exceptions.filter';
import { CartNotFoundError } from '~/domains/cart/app/errors/cart-app.error';
import { ChatExceptionsFilter } from '~/domains/chat/api/rest/errors/chat-exceptions.filter';
import { ChatConversationNotFoundError } from '~/domains/chat/app/errors/chat-app.error';
import { CheckoutExceptionsFilter } from '~/domains/checkout/api/rest/errors/checkout-exceptions.filter';
import { FulfillmentExceptionsFilter } from '~/domains/fulfillment/api/rest/errors/fulfillment-exceptions.filter';
import { ShipmentNotFoundError } from '~/domains/fulfillment/app/errors/fulfillment-app.error';
import { OrderExceptionsFilter } from '~/domains/order/api/rest/errors/order-exceptions.filter';
import { OrderNotFoundError } from '~/domains/order/app/errors/order-app.error';
import { ProductImportNotFoundError } from '~/domains/product/app/product-import/product-import.errors';
import { ShopExceptionsFilter } from '~/domains/shop/api/rest/errors/shop-exceptions.filter';
import { ProductImportExceptionsFilter } from '~/domains/shop/api/rest/errors/product-import-exceptions.filter';
import { SaleNotFoundError } from '~/domains/shop/app/errors/shop-app.error';

jest.mock('../sentry/sentry', () => ({
  captureException: jest.fn(),
}));

function build(create: (requestContext: never, logger: never) => ExceptionFilter): ExceptionFilter {
  return create(
    { get: () => ({ requestId: 'req-123' }) } as never,
    { error: jest.fn() } as never,
  );
}

describe('DomainExceptionFilter', () => {
  describe.each<[string, () => ExceptionFilter, unknown]>([
    ['shop', () => build((requestContext, logger) => new ShopExceptionsFilter(requestContext, logger)), new SaleNotFoundError()],
    ['order', () => build((requestContext, logger) => new OrderExceptionsFilter(requestContext, logger)), new OrderNotFoundError()],
    ['chat', () => build((requestContext, logger) => new ChatExceptionsFilter(requestContext, logger)), new ChatConversationNotFoundError()],
    ['fulfillment', () => build((requestContext, logger) => new FulfillmentExceptionsFilter(requestContext, logger)), new ShipmentNotFoundError()],
    ['cart', () => build((requestContext, logger) => new CartExceptionsFilter(requestContext, logger)), new CartNotFoundError()],
    ['product import', () => build((requestContext, logger) => new ProductImportExceptionsFilter(requestContext, logger)), new ProductImportNotFoundError('imp_1')],
  ])('%s filter', (_domain, buildFilter, domainError) => {
    it('renders the domain error through its HTTP mapper', () => {
      const response = createResponse();

      buildFilter().catch(domainError, createArgumentsHost(response));

      expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: HttpStatus.NOT_FOUND }),
      );
    });

    it('leaves a non-domain HTTP exception untouched', () => {
      const response = createResponse();

      buildFilter().catch(
        new HttpException('teapot', HttpStatus.I_AM_A_TEAPOT),
        createArgumentsHost(response),
      );

      expect(response.status).toHaveBeenCalledWith(HttpStatus.I_AM_A_TEAPOT);
    });

    it('still reports an unrecognised error as a server error', () => {
      const response = createResponse();

      buildFilter().catch(new Error('boom'), createArgumentsHost(response));

      expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  it('leaves another domain error to the global filter instead of guessing a mapper', () => {
    const response = createResponse();

    // The checkout mapper only owns order and promotion errors; the cart
    // domain's identically named error is not one of them.
    build((requestContext, logger) => new CheckoutExceptionsFilter(requestContext, logger)).catch(
      new CartNotFoundError(),
      createArgumentsHost(response),
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });
});

function createArgumentsHost(response: Response): ArgumentsHost {
  const request = { method: 'GET', url: '/v1/orders/123' } as Request;

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
