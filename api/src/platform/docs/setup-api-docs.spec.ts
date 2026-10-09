import type { INestApplication } from '@nestjs/common';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiResponse, getSchemaPath } from '@nestjs/swagger';
import request from 'supertest';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { ApiErrorResponseDto } from '~/platform/http/api-error-response.dto';
import { setupApiDocs } from './setup-api-docs';

const preservedConflictExample = {
  status_code: 409,
  code: 'PRODUCT_VERSION_CONFLICT',
  message: 'Refresh the product before saving.',
};

// Declares its own responses directly, mixing an authored plain example with an
// incomplete response that the docs pipeline is expected to complete.
@Controller('products')
class ProductsDocsController {
  @Get()
  @ApiResponse({ status: 404, description: 'Product missing.' })
  @ApiResponse({
    status: 409,
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
        example: preservedConflictExample,
      },
    },
  })
  list() {
    return [];
  }
}

// Class-level failures must reach every route; a method-level failure must not.
@Controller('orders')
@ApiErrorResponses({
  429: [{ code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' }],
  500: [{ code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error.' }],
})
class OrdersDocsController {
  @Get('detailed')
  @ApiResponse({ status: 404, description: 'Order missing.' })
  @ApiErrorResponses({
    409: [
      {
        code: 'CHECKOUT_PRICE_CHANGED',
        message: 'Prices changed since the quote was issued.',
        details: { fields: [{ field: 'items', messages: ['price changed'] }] },
      },
      {
        code: 'CHECKOUT_SHIPPING_UNAVAILABLE',
        message: 'Shipping is unavailable for the selected address.',
      },
    ],
  })
  detailed() {
    return {};
  }

  @Get('plain')
  plain() {
    return {};
  }
}

// Public read-only configuration: no business failures are declared.
@Controller('client-config')
class ClientConfigDocsController {
  @Get()
  read() {
    return {};
  }
}

@Module({
  controllers: [ProductsDocsController, OrdersDocsController, ClientConfigDocsController],
})
class DocsModule {}

type DocumentPaths = Record<string, Record<string, { responses: Record<string, any> }>>;

function responsesFor(paths: DocumentPaths, path: string): Record<string, any> {
  return paths[path].get.responses;
}

describe('API documentation error responses', () => {
  let app: INestApplication;
  let paths: DocumentPaths;

  beforeAll(async () => {
    app = await NestFactory.create(DocsModule, { logger: false });
    app.setGlobalPrefix('v1');
    setupApiDocs(app);
    await app.init();
    paths = (await request(app.getHttpServer()).get('/docs/openapi.json').expect(200)).body.paths;
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents only declared error statuses and completes the declared schema', async () => {
    const responses = responsesFor(paths, '/v1/products');

    expect(Object.keys(responses).sort()).toEqual(['404', '409']);
    expect(responses['404'].description).toBe('Product missing.');
    expect(responses['404'].content['application/json'].schema.$ref).toBe(
      getSchemaPath(ApiErrorResponseDto),
    );
    expect(responses['404'].content['application/json'].example).toMatchObject({
      status_code: 404,
      code: 'NOT_FOUND',
    });
  });

  it('does not acquire undeclared error statuses', async () => {
    for (const status of ['400', '401', '403', '422', '429']) {
      expect(responsesFor(paths, '/v1/products')[status]).toBeUndefined();
    }
  });

  it('preserves an explicitly authored endpoint example', async () => {
    const responses = responsesFor(paths, '/v1/products');

    expect(responses['409'].content['application/json'].example).toEqual(preservedConflictExample);
    expect(responses['409'].content['application/json'].examples).toBeUndefined();
  });

  it('applies class-level failures to every route and keeps method failures local', async () => {
    for (const path of ['/v1/orders/detailed', '/v1/orders/plain']) {
      const responses = responsesFor(paths, path);

      expect(responses['429'].content['application/json'].examples.RATE_LIMIT_EXCEEDED.value)
        .toMatchObject({ status_code: 429, code: 'RATE_LIMIT_EXCEEDED' });
      expect(responses['500'].content['application/json'].examples.INTERNAL_SERVER_ERROR.value)
        .toMatchObject({ status_code: 500, code: 'INTERNAL_SERVER_ERROR' });
    }

    expect(responsesFor(paths, '/v1/orders/detailed')['404']).toBeDefined();
    expect(responsesFor(paths, '/v1/orders/plain')['404']).toBeUndefined();
  });

  it('leaves a plain read route free of auth, conflict and validation failures', async () => {
    const responses = responsesFor(paths, '/v1/orders/plain');

    for (const status of ['401', '403', '409', '422']) {
      expect(responses[status]).toBeUndefined();
    }
  });

  it('preserves multiple named business errors with distinct codes, statuses and details', async () => {
    const media = responsesFor(paths, '/v1/orders/detailed')['409'].content['application/json'];

    expect(media.schema.$ref).toBe(getSchemaPath(ApiErrorResponseDto));
    expect(Object.keys(media.examples).sort()).toEqual([
      'CHECKOUT_PRICE_CHANGED',
      'CHECKOUT_SHIPPING_UNAVAILABLE',
    ]);
    expect(media.examples.CHECKOUT_PRICE_CHANGED.value).toEqual({
      status_code: 409,
      code: 'CHECKOUT_PRICE_CHANGED',
      message: 'Prices changed since the quote was issued.',
      details: { fields: [{ field: 'items', messages: ['price changed'] }] },
    });
    expect(media.examples.CHECKOUT_SHIPPING_UNAVAILABLE.value).toEqual({
      status_code: 409,
      code: 'CHECKOUT_SHIPPING_UNAVAILABLE',
      message: 'Shipping is unavailable for the selected address.',
    });
  });

  it('leaves a public configuration endpoint free of business failures', async () => {
    const responses = responsesFor(paths, '/v1/client-config') ?? {};

    for (const status of ['400', '401', '403', '404', '409', '422', '429', '500']) {
      expect(responses[status]).toBeUndefined();
    }
  });
});
