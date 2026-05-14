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
import type { AuthUserResponse } from '../src/modules/domains/auth/app/auth.types';
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
        credentials: true,
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
    const ownerAgent = request.agent(app.getHttpServer());

    const registerResponse = await ownerAgent
      .post(`${API_PREFIX}/auth/register`)
      .send({
        email,
        password: 'password123',
        displayName: 'Commerce Owner',
      })
      .expect(201);
    const registerBody = registerResponse.body as unknown as AuthUserResponse;

    const shopResponse = await ownerAgent
      .post(`${API_PREFIX}/shops`)
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

    const categoryResponse = await ownerAgent
      .post(`${API_PREFIX}/categories`)
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

    const categoryAttributeResponse = await ownerAgent
      .post(`${API_PREFIX}/categories/${categoryBody.id}/attributes`)
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

    const createProductResponse = await ownerAgent
      .post(`${API_PREFIX}/shops/${shopBody.id}/products`)
      .send({
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

    const updateProductResponse = await ownerAgent
      .patch(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}`)
      .send({
        title: 'Better Mug',
        description: 'Refined ceramic mug',
        whoMade: ProductWhoMade.COLLECTIVE,
        isDigital: true,
        nonTaxable: true,
      })
      .expect(200);

    expect(updateProductResponse.body).toMatchObject({
      id: productId,
      title: 'Better Mug',
      slug: 'better-mug',
      description: 'Refined ceramic mug',
      whoMade: ProductWhoMade.COLLECTIVE,
      isDigital: true,
      nonTaxable: true,
    });

    await request(app.getHttpServer())
      .get(`${API_PREFIX}/products/${productId}`)
      .expect(404);

    const setImagesResponse = await ownerAgent
      .put(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}/images`)
      .attach('images', Buffer.from('fake-image-content'), {
        filename: 'mug.jpg',
        contentType: 'image/jpeg',
      })
      .expect(200);

    expect(setImagesResponse.body.images).toHaveLength(1);

    const setAttributesResponse = await ownerAgent
      .put(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}/attributes`)
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

    const setInventoryResponse = await ownerAgent
      .put(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}/inventory`)
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

    const setShippingResponse = await ownerAgent
      .put(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}/shipping`)
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

    const publishResponse = await ownerAgent
      .post(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}/publish`)
      .expect(201);

    expect(publishResponse.body.state).toBe('active');

    const getPublicProductResponse = await request(app.getHttpServer())
      .get(`${API_PREFIX}/products/${productId}`)
      .expect(200);

    expect(getPublicProductResponse.body).toMatchObject({
      id: productId,
      shop: {
        id: shopBody.id,
        shopName: shopBody.shopName,
      },
      categoryId: categoryBody.id,
      title: 'Better Mug',
      slug: 'better-mug',
      description: 'Refined ceramic mug',
      whoMade: ProductWhoMade.COLLECTIVE,
      isDigital: true,
      variantType: ProductVariantType.NONE,
      shipping: {
        processTimeLabel: '1-3 business days',
      },
    });
    expect(getPublicProductResponse.body.images).toHaveLength(1);
    expect(getPublicProductResponse.body.inventory).toHaveLength(1);

    const getProductResponse = await ownerAgent
      .get(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}`)
      .expect(200);

    expect(getProductResponse.body).toMatchObject({
      id: productId,
      state: 'active',
      shopId: shopBody.id,
      categoryId: categoryBody.id,
      title: 'Better Mug',
      slug: 'better-mug',
      description: 'Refined ceramic mug',
      whoMade: ProductWhoMade.COLLECTIVE,
      isDigital: true,
      nonTaxable: true,
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

    const secondProductResponse = await ownerAgent
      .post(`${API_PREFIX}/shops/${shopBody.id}/products`)
      .send({
        categoryId: categoryBody.id,
        title: 'Draft Mug',
        description: 'Unpublished draft mug',
        whoMade: ProductWhoMade.I_DID,
        variantType: ProductVariantType.NONE,
      })
      .expect(201);

    const otherUserEmail = `commerce-other-${Date.now()}@example.com`;
    const otherAgent = request.agent(app.getHttpServer());
    await otherAgent
      .post(`${API_PREFIX}/auth/register`)
      .send({
        email: otherUserEmail,
        password: 'password123',
        displayName: 'Other Commerce Owner',
      })
      .expect(201);

    const otherShopResponse = await otherAgent
      .post(`${API_PREFIX}/shops`)
      .send({
        shopName: `shop${Date.now().toString().slice(-5)}x`,
      })
      .expect(201);
    const otherShopBody = otherShopResponse.body as { id: string };

    await otherAgent
      .post(`${API_PREFIX}/shops/${otherShopBody.id}/products`)
      .send({
        categoryId: categoryBody.id,
        title: 'Other Shop Mug',
        description: 'Different shop product',
        whoMade: ProductWhoMade.I_DID,
        variantType: ProductVariantType.NONE,
      })
      .expect(201);

    const listProductsResponse = await ownerAgent
      .get(`${API_PREFIX}/shops/${shopBody.id}/products`)
      .query({
        state: 'active',
        search: 'better',
        page: 1,
        limit: 5,
      })
      .expect(200);

    expect(listProductsResponse.body.meta).toMatchObject({
      page: 1,
      limit: 5,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
    expect(listProductsResponse.body.items).toHaveLength(1);
    expect(listProductsResponse.body.items[0]).toMatchObject({
      id: productId,
      shopId: shopBody.id,
      state: 'active',
      title: 'Better Mug',
      slug: 'better-mug',
    });
    expect(listProductsResponse.body.items[0].id).not.toBe(
      secondProductResponse.body.id
    );
  });

  it('supports persistent carts and temp carts through the legacy-compatible user cart contract', async () => {
    const email = `commerce-cart-${Date.now()}@example.com`;
    const agent = request.agent(app.getHttpServer());

    await agent
      .post(`${API_PREFIX}/auth/register`)
      .send({
        email,
        password: 'password123',
        displayName: 'Cart Owner',
      })
      .expect(201);

    const shopResponse = await agent
      .post(`${API_PREFIX}/shops`)
      .send({
        shopName: `cartshop${Date.now().toString().slice(-6)}`,
      })
      .expect(201);
    const shopBody = shopResponse.body as { id: string; shopName: string };

    const categoryResponse = await agent
      .post(`${API_PREFIX}/categories`)
      .send({
        name: 'Bowls',
        rank: 1,
      })
      .expect(201);
    const categoryBody = categoryResponse.body as { id: string };

    const productResponse = await agent
      .post(`${API_PREFIX}/shops/${shopBody.id}/products`)
      .send({
        categoryId: categoryBody.id,
        title: 'Soup Bowl',
        description: 'Stoneware bowl',
        whoMade: ProductWhoMade.I_DID,
        variantType: ProductVariantType.NONE,
      })
      .expect(201);
    const productId = productResponse.body.id as string;

    await agent
      .put(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}/images`)
      .attach('images', Buffer.from('fake-image-content'), {
        filename: 'bowl.jpg',
        contentType: 'image/jpeg',
      })
      .expect(200);

    const inventoryResponse = await agent
      .put(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}/inventory`)
      .send({
        inventory: [
          {
            sku: 'BOWL-001',
            stock: 8,
            price: 12.5,
          },
        ],
      })
      .expect(200);
    const inventoryId = inventoryResponse.body.inventory[0].id as string;

    await agent
      .put(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}/shipping`)
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

    await agent
      .post(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}/publish`)
      .expect(201);

    const addCartResponse = await agent
      .post(`${API_PREFIX}/user/cart`)
      .send({
        inventory_id: inventoryId,
        quantity: 2,
      })
      .expect(201);

    expect(addCartResponse.body.cart).toMatchObject({
      user_id: expect.any(String),
      summary_cart: {
        total_products: 2,
      },
    });
    expect(addCartResponse.body.cart.shop_carts).toHaveLength(1);
    expect(addCartResponse.body.cart.shop_carts[0]).toMatchObject({
      shop: {
        id: shopBody.id,
        shop_name: shopBody.shopName,
      },
      total_shipping_fee: 0,
      total_price: 25,
    });
    expect(addCartResponse.body.summary_order).toMatchObject({
      subtotal_price: 25,
      total_price: 25,
      total_products: 2,
    });

    const getCartResponse = await agent
      .get(`${API_PREFIX}/user/cart`)
      .expect(200);

    expect(getCartResponse.body.cart.shop_carts[0].products[0]).toMatchObject({
      quantity: 2,
      is_select_order: true,
      product: {
        id: productId,
        title: 'Soup Bowl',
        variant_type: ProductVariantType.NONE,
      },
      inventory: {
        id: inventoryId,
        price: 12.5,
        stock: 8,
        sku: 'BOWL-001',
      },
    });

    const uncheckedCartResponse = await agent
      .patch(`${API_PREFIX}/user/cart`)
      .send({
        inventory_id: inventoryId,
        is_select_order: false,
      })
      .expect(200);

    expect(uncheckedCartResponse.body.summary_order).toMatchObject({
      subtotal_price: 0,
      total_price: 0,
      total_products: 0,
    });
    expect(uncheckedCartResponse.body.cart.shop_carts[0].products[0].is_select_order)
      .toBe(false);

    const updatedCartResponse = await agent
      .patch(`${API_PREFIX}/user/cart`)
      .send({
        inventory_id: inventoryId,
        quantity: 3,
        is_select_order: true,
      })
      .expect(200);

    expect(updatedCartResponse.body.summary_order).toMatchObject({
      subtotal_price: 37.5,
      total_price: 37.5,
      total_products: 3,
    });
    expect(updatedCartResponse.body.cart.shop_carts[0].products[0].quantity)
      .toBe(3);

    const tempCartResponse = await agent
      .post(`${API_PREFIX}/user/cart`)
      .send({
        inventory_id: inventoryId,
        quantity: 1,
        is_temp: true,
      })
      .expect(201);

    const tempCartId = tempCartResponse.body.cart.cart_id as string;
    expect(tempCartResponse.body.summary_order.total_price).toBe(12.5);

    const getTempCartResponse = await agent
      .get(`${API_PREFIX}/user/cart`)
      .query({
        cart_id: tempCartId,
      })
      .expect(200);

    expect(getTempCartResponse.body.cart.cart_id).toBe(tempCartId);
    expect(getTempCartResponse.body.cart.shop_carts[0].products[0].quantity).toBe(1);

    const updatedTempCartResponse = await agent
      .patch(`${API_PREFIX}/user/cart`)
      .send({
        cart_id: tempCartId,
        inventory_id: inventoryId,
        quantity: 2,
      })
      .expect(200);

    expect(updatedTempCartResponse.body.summary_order.total_price).toBe(25);
    expect(updatedTempCartResponse.body.cart.cart_id).toBe(tempCartId);

    const deletedRegularCartResponse = await agent
      .delete(`${API_PREFIX}/user/cart`)
      .query({
        inventory_id: inventoryId,
      })
      .expect(200);

    expect(deletedRegularCartResponse.body).toMatchObject({
      cart: null,
      summary_order: {
        total_price: 0,
        total_products: 0,
      },
    });
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
