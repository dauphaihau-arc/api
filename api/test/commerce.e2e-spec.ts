import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import type { App } from 'supertest/types';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { RequestLoggingInterceptor } from '../src/common/interceptors/request-logging.interceptor';
import { parseCorsAllowedOrigins } from '../src/config/cors.config';
import { AppModule } from '../src/modules/app.module';
import type { AuthResponse } from '../src/modules/domains/auth/app/auth.types';
import { ProductShippingCharge } from '../src/modules/domains/product/domain/enums/product-shipping-charge.enum';
import { ProductVariantType } from '../src/modules/domains/product/domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '../src/modules/domains/product/domain/enums/product-who-made.enum';
import { StorageService } from '../src/modules/shared/storage/app/ports/storage.service';
import { LocalFileStorageService } from '../src/modules/shared/storage/infra/local-file-storage.service';
import { createTestDatabase, dropTestDatabase } from './e2e-postgres';

jest.setTimeout(30_000);

const API_PREFIX = '/v1';

describe('Commerce flow (e2e)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let storageRoot: string;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase();
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-commerce-e2e-'));

    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = testDb.rootConfig.host;
    process.env.DB_PORT = String(testDb.rootConfig.port);
    process.env.DB_USER = testDb.rootConfig.user;
    process.env.DB_PASSWORD = testDb.rootConfig.password;
    process.env.DB_NAME = testDb.dbName;
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.JWT_ACCESS_TTL = '15m';
    process.env.JWT_REFRESH_TTL = '7d';
    process.env.BCRYPT_SALT_ROUNDS = '4';
    process.env.CACHE_DRIVER = 'memory';
    process.env.RATE_LIMIT_DRIVER = 'memory';
    process.env.QUEUE_DRIVER = 'inline';
    process.env.MAIL_DRIVER = 'logger';
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_ROOT = storageRoot;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(
        new LocalFileStorageService({
          driver: 'local',
          localRoot: storageRoot,
        })
      )
      .compile();

    app = moduleFixture.createNestApplication();
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    const corsAllowedOrigins = parseCorsAllowedOrigins(process.env);

    if (corsAllowedOrigins.length > 0) {
      app.enableCors({
        origin: corsAllowedOrigins,
      });
    }

    app.enableShutdownHooks();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      })
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(
      new ClassSerializerInterceptor(app.get(Reflector)),
      new RequestLoggingInterceptor()
    );
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (storageRoot) {
      await rm(storageRoot, {
        recursive: true,
        force: true,
      });
    }

    restoreProcessEnv(originalEnv);

    if (testDb) {
      await dropTestDatabase(testDb);
    }
  });

  it('creates a shop and category, configures a product, and publishes it', async () => {
    const email = `commerce-${Date.now()}@example.com`;

    const registerResponse = await request(app.getHttpServer())
      .post(`${API_PREFIX}/auth/register`)
      .send({
        email,
        password: 'password123',
        displayName: 'Commerce Owner',
      })
      .expect(201);
    const registerBody = registerResponse.body as unknown as AuthResponse;
    const accessToken = registerBody.accessToken;

    const shopResponse = await request(app.getHttpServer())
      .post(`${API_PREFIX}/shops`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        shopName: `shop${Date.now().toString().slice(-6)}`,
      })
      .expect(201);
    const shopBody = shopResponse.body as {
      id: string;
      ownerUserId: string;
      shopName: string;
      status: string;
    };

    expect(shopBody.id).toEqual(expect.any(String));
    expect(shopBody.ownerUserId).toBe(registerBody.user.id);

    const categoryResponse = await request(app.getHttpServer())
      .post(`${API_PREFIX}/categories`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Mugs',
        rank: 1,
      })
      .expect(201);
    const categoryBody = categoryResponse.body as {
      id: string;
      name: string;
      attributes: unknown[];
    };

    expect(categoryBody.name).toBe('Mugs');
    expect(categoryBody.attributes).toEqual([]);

    const categoryAttributeResponse = await request(app.getHttpServer())
      .post(`${API_PREFIX}/categories/${categoryBody.id}/attributes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Material',
        inputType: 'select',
        options: ['Ceramic', 'Stoneware'],
      })
      .expect(201);

    expect(categoryAttributeResponse.body.attributes).toHaveLength(1);
    const materialAttribute = categoryAttributeResponse.body.attributes[0] as {
      id: string;
      options: Array<{ id: string; value: string }>;
    };

    const createProductResponse = await request(app.getHttpServer())
      .post(`${API_PREFIX}/products`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        shopId: shopBody.id,
        categoryId: categoryBody.id,
        title: 'Handmade Mug',
        description: 'Wheel-thrown ceramic mug',
        whoMade: ProductWhoMade.I_DID,
        variantType: ProductVariantType.NONE,
      })
      .expect(201);
    const productBody = createProductResponse.body as {
      id: string;
      state: string;
      images: unknown[];
      inventory: unknown[];
      variants: unknown[];
    };

    expect(productBody.state).toBe('draft');
    expect(productBody.images).toEqual([]);
    expect(productBody.inventory).toEqual([]);
    expect(productBody.variants).toEqual([]);

    const productId = productBody.id;

    const setImagesResponse = await request(app.getHttpServer())
      .put(`${API_PREFIX}/products/${productId}/images`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('images', Buffer.from('fake-image-content'), {
        filename: 'mug.jpg',
        contentType: 'image/jpeg',
      })
      .expect(200);

    expect(setImagesResponse.body.images).toHaveLength(1);

    const setAttributesResponse = await request(app.getHttpServer())
      .put(`${API_PREFIX}/products/${productId}/attributes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        attributes: [
          {
            categoryAttributeId: materialAttribute.id,
            selectedOptionId: materialAttribute.options[0]?.id,
          },
        ],
      })
      .expect(200);

    expect(setAttributesResponse.body.attributes).toHaveLength(1);
    expect(setAttributesResponse.body.attributes[0]).toMatchObject({
      categoryAttributeId: materialAttribute.id,
      selectedOptionId: materialAttribute.options[0]?.id,
      selectedOptionValue: 'Ceramic',
    });

    const setInventoryResponse = await request(app.getHttpServer())
      .put(`${API_PREFIX}/products/${productId}/inventory`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        inventory: [
          {
            sku: 'MUG-001',
            stock: 10,
            price: 19.99,
          },
        ],
      })
      .expect(200);

    expect(setInventoryResponse.body.inventory).toHaveLength(1);

    const setShippingResponse = await request(app.getHttpServer())
      .put(`${API_PREFIX}/products/${productId}/shipping`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        originCountry: 'US',
        originZip: '10001',
        processTimeLabel: '1-3 business days',
        destinations: [
          {
            countryCode: 'US',
            deliveryTimeLabel: '3-5 business days',
            service: 'USPS',
            chargeType: ProductShippingCharge.FREE_SHIPPING,
          },
        ],
      })
      .expect(200);

    expect(setShippingResponse.body.shipping).toBeDefined();
    expect(setShippingResponse.body.shipping.destinations).toHaveLength(1);

    const publishResponse = await request(app.getHttpServer())
      .post(`${API_PREFIX}/products/${productId}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(publishResponse.body.state).toBe('active');

    const getProductResponse = await request(app.getHttpServer())
      .get(`${API_PREFIX}/products/${productId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(getProductResponse.body).toMatchObject({
      id: productId,
      state: 'active',
      shopId: shopBody.id,
      categoryId: categoryBody.id,
      attributes: [
        {
          categoryAttributeId: materialAttribute.id,
          selectedOptionId: materialAttribute.options[0]?.id,
          selectedOptionValue: 'Ceramic',
        },
      ],
    });
    expect(getProductResponse.body.images).toHaveLength(1);
    expect(getProductResponse.body.inventory).toHaveLength(1);
    expect(getProductResponse.body.shipping.destinations).toHaveLength(1);
  });
});

function restoreProcessEnv(originalEnv: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}
