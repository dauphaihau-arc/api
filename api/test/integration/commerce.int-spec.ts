import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { MikroORM } from '@mikro-orm/postgresql';
import { Client } from 'pg';
import os from 'node:os';
import path from 'node:path';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import request from 'supertest';
import type { App } from 'supertest/types';
import { GlobalExceptionFilter } from '~/platform/filters/global-exception.filter';
import { RequestLoggingInterceptor } from '~/platform/interceptors/request-logging.interceptor';
import { parseCorsAllowedOrigins } from '~/platform/config/cors.config';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import type * as BootstrapAppModule from '~/bootstrap/app.module';
import type { AuthUserResponse } from '~/domains/auth/app/auth.types';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { LocalFileStorageService } from '~/integrations/storage/infra/local-file-storage.service';
import { ObservabilityService } from '~/platform/observability/observability.service';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { PermissionEntity } from '~/domains/auth/infra/persistence/entities/permission.entity';
import { RoleEntity } from '~/domains/auth/infra/persistence/entities/role.entity';
import { RolePermissionEntity } from '~/domains/auth/infra/persistence/entities/role-permission.entity';
import { seedAuthReferenceData } from '../../database/seeds/auth.seed';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';
import { seedPublishableInventory } from '../support/shipping-fixtures';

jest.setTimeout(240_000);

const API_PREFIX = '/v1';
const VALID_TEST_PASSWORD = 'Password123!';

// Minimal valid 1x1 JPEG so the inline image-variant queue job does not fail.
const VALID_JPEG_BUFFER = Buffer.from(
  'FFD8FFE000104A46494600010100000100010000FFDB00430008060607060508070707090908080A0C140D0C0B0B0C1912130F143D1A1F1E1D1A1C1C20242E2720222C231C1C2837292C30313434341F27393D38323C2E333432FFDB0043010909090C0B0C180D0D1832211C213232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232FFC00011080001000103012200021101031101FFC4001F0000010501010101010100000000000000000102030405060708090A0BFFC400B5100002010303020403050504040000017D01020300041105122131410613516107227114328191A1082342B1C11552D1F02433627282090A161718191A25262728292A3435363738393A434445464748494A535455565758595A636465666768696A737475767778797A838485868788898A92939495969798999AA2A3A4A5A6A7A8A9AAB2B3B4B5B6B7B8B9BAC2C3C4C5C6C7C8C9CAD2D3D4D5D6D7D8D9DAE1E2E3E4E5E6E7E8E9EAF1F2F3F4F5F6F7F8F9FAFFC4001F0100030101010101010101010000000000000102030405060708090A0BFFC400B51100020102040403040705040400010277000102031104052131061241510761711322328108144291A1B1C109233352F0156272D10A162434E125F11718191A262728292A35363738393A434445464748494A535455565758595A636465666768696A737475767778797A82838485868788898A92939495969798999AA2A3A4A5A6A7A8A9AAB2B3B4B5B6B7B8B9BAC2C3C4C5C6C7C8C9CAD2D3D4D5D6D7D8D9DAE2E3E4E5E6E7E8E9EAF2F3F4F5F6F7F8F9FAFFDA000C03010002110311003F00FDFCA8A2800FFFD9',
  'hex',
);

function randomForwardedIp() {
  return `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
}

// This integration suite stays in one file because the setup and assertions share state heavily.
// eslint-disable-next-line max-lines-per-function
describe('Commerce flow (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let storageRoot: string;
  let sql: Client;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('commerce');
    sql = new Client({
      host: testDb.rootConfig.host,
      port: testDb.rootConfig.port,
      user: testDb.rootConfig.user,
      password: testDb.rootConfig.password,
      database: testDb.dbName,
    });
    await sql.connect();
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-commerce-int-'));

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
    const seedOrm = await MikroORM.init({
      ...buildDatabaseConfig(process.env, { debug: false }),
      entities: [RoleEntity, PermissionEntity, RolePermissionEntity],
    });

    try {
      await seedAuthReferenceData(seedOrm.em.fork());
    }
    finally {
      await seedOrm.close(true);
    }


    // AppModule must be loaded AFTER the throwaway database env is applied:
    // its MikroORM options are computed at module evaluation time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('~/bootstrap/app.module') as typeof BootstrapAppModule;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(
        new LocalFileStorageService({
          driver: 'local',
          localRoot: storageRoot,
        }),
      )
      // Follow-up projection/variant jobs are exercised elsewhere; running them
      // inline here couples HTTP assertions to unrelated job execution.
      .overrideProvider(JobDispatcher)
      .useValue({ dispatch: jest.fn().mockResolvedValue(undefined) })
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
      }),
    );
    const exceptionLogger = await app.resolve(PinoLogger);
    const requestLogger = await app.resolve(PinoLogger);
    app.useGlobalFilters(
      new GlobalExceptionFilter(
        app.get(RequestContextService),
        exceptionLogger,
      ),
    );
    app.useGlobalInterceptors(
      new ClassSerializerInterceptor(app.get(Reflector)),
      new RequestLoggingInterceptor(
        app.get(RequestContextService),
        app.get(ObservabilityService),
        requestLogger,
      ),
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

    if (sql) {
      await sql.end();
    }

    restoreProcessEnv(originalEnv);

    if (testDb) {
      await dropTestDatabase(testDb);
    }
  });
  async function ensureShopShippingProfile(
    agent: ReturnType<typeof request.agent>,
    shopId: string,
  ): Promise<string> {
    const listResponse = await agent
      .get(`${API_PREFIX}/shops/${shopId}/shipping-profiles`)
      .expect(200);
    const existing = (listResponse.body as { results: Array<{ id: string }> }).results[0];

    if (existing) {
      return existing.id;
    }

    const createResponse = await agent
      .post(`${API_PREFIX}/shops/${shopId}/shipping-profiles`)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Standard shipping',
        status: 'active',
        ship_from_country: 'US',
        ship_from_postal: '10001',
        processing_time_min_days: 1,
        processing_time_max_days: 3,
        rates: [
          {
            destination_scope: 'country',
            destination_country: 'US',
            one_item_fee_minor: 599,
            additional_item_fee_minor: 199,
            delivery_time_min_days: 3,
            delivery_time_max_days: 5,
          },
          {
            destination_scope: 'everywhere_else',
            one_item_fee_minor: 1999,
            additional_item_fee_minor: 599,
            delivery_time_min_days: 7,
            delivery_time_max_days: 14,
          },
        ],
      })
      .expect(201);

    return (createResponse.body as { id: string }).id;
  }

  async function assignShippingProfile(
    agent: ReturnType<typeof request.agent>,
    shopId: string,
    productId: string,
  ): Promise<string> {
    const shippingProfileId = await ensureShopShippingProfile(agent, shopId);

    await agent
      .put(`${API_PREFIX}/shops/${shopId}/products/${productId}/shipping-profile`)
      .set('Idempotency-Key', randomUUID())
      .send({ shipping_profile_id: shippingProfileId })
      .expect(204);

    return shippingProfileId;
  }

  async function grantSellerRole(userId: string): Promise<void> {
    const sellerRole = await sql.query<{ id: string }>(
      'select "id" from "roles" where "key" = \'seller\'',
    );
    await sql.query(
      `insert into "user_roles" ("id", "created_at", "updated_at", "assigned_at", "user_id", "role_id")
       values ($1, now(), now(), now(), $2, $3)`,
      [randomUUID(), userId, sellerRole.rows[0].id],
    );
  }

  it('creates a shop and category, configures a product, and publishes it', async () => {
    const email = `commerce-${Date.now()}@example.com`;
    const ownerAgent = request.agent(app.getHttpServer());
    async function configureAndPublishProduct(input: {
      productId: string;
      selectedOptionId: string;
      sku: string;
      priceMinor: number;
    }) {
      await ownerAgent
        .put(`${API_PREFIX}/shops/${shopBody.id}/products/${input.productId}/images`)
        .attach('images', VALID_JPEG_BUFFER, {
          filename: `${input.productId}.jpg`,
          contentType: 'image/jpeg',
        })
        .expect(204);

      await ownerAgent
        .put(`${API_PREFIX}/shops/${shopBody.id}/products/${input.productId}/attributes`)
        .set('Idempotency-Key', randomUUID())
        .send({
          attributes: [
            {
              category_attribute_id: materialAttribute.id,
              selected_option_id: input.selectedOptionId,
            },
          ],
        })
        .expect(200);

      const productDraftResponse = await ownerAgent
        .get(`${API_PREFIX}/shops/${shopBody.id}/products/${input.productId}`)
        .expect(200);
      const inventoryId = (
        productDraftResponse.body as { inventory: Array<{ id: string }> }
      ).inventory[0]?.id;

      expect(inventoryId).toEqual(expect.any(String));

      await seedPublishableInventory(sql, {
        shopId: shopBody.id,
        inventoryId,
        sku: input.sku,
        stock: 10,
        amountMinor: input.priceMinor,
        currency: 'USD',
      });

      await assignShippingProfile(ownerAgent, shopBody.id, input.productId);

      await ownerAgent
        .post(`${API_PREFIX}/shops/${shopBody.id}/products/${input.productId}/publish`)
        .set('Idempotency-Key', randomUUID())
        .expect(201);
    }

    const registerResponse = await ownerAgent
      .post(`${API_PREFIX}/auth/register`)
      .set('X-Forwarded-For', randomForwardedIp())
      .set('Idempotency-Key', randomUUID())
      .send({
        email,
        password: VALID_TEST_PASSWORD,
        displayName: 'Commerce Owner',
      })
      .expect(201);
    const registerBody = registerResponse.body as unknown as AuthUserResponse;
    await grantSellerRole(registerBody.user.id);

    const shopResponse = await ownerAgent
      .post(`${API_PREFIX}/shops`)
      .send({
        shop_name: `shop${Date.now().toString().slice(-6)}`,
        currency: 'USD',
      })
      .expect(201);
    const shopBody = shopResponse.body as {
      id: string;
      owner_user_id: string;
      shop_name: string;
      status: string;
    };

    expect(shopBody.id).toEqual(expect.any(String));
    expect(shopBody.owner_user_id).toBe(registerBody.user.id);

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
        input_type: 'select',
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
      .set('Idempotency-Key', randomUUID())
      .send({
        category_id: categoryBody.id,
        title: 'Handmade Mug',
        description: 'Wheel-thrown ceramic mug',
        who_made: ProductWhoMade.I_DID,
      })
      .expect(201);
    const productBody = createProductResponse.body as {
      id: string;
      state: string;
      product_version: number;
      images: unknown[];
      inventory: unknown[];
      variants: unknown[];
    };

    expect(productBody.state).toBe('draft');
    expect(productBody.images).toEqual([]);
    expect(productBody.inventory).toHaveLength(1);
    expect(productBody.variants).toHaveLength(1);

    const productId = productBody.id;

    const productBeforeDetailsResponse = await ownerAgent
      .get(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}`)
      .expect(200);
    const currentProductVersion = (productBeforeDetailsResponse.body as { product_version: number })
      .product_version;

    const updateDetailsResponse = await ownerAgent
      .patch(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}/details`)
      .set('Idempotency-Key', randomUUID())
      .send({
        title: 'Better Mug',
        description: 'Refined ceramic mug',
        who_made: ProductWhoMade.COLLECTIVE,
        is_digital: true,
        non_taxable: true,
        product_version: currentProductVersion,
      })
      .expect(200);

    expect(updateDetailsResponse.body).toMatchObject({
      id: productId,
      title: 'Better Mug',
      description: 'Refined ceramic mug',
      who_made: ProductWhoMade.COLLECTIVE,
      is_digital: true,
      non_taxable: true,
    });

    await request(app.getHttpServer())
      .get(`${API_PREFIX}/products/${productId}`)
      .expect(404);

    await ownerAgent
      .put(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}/images`)
      .attach('images', VALID_JPEG_BUFFER, {
        filename: 'mug.jpg',
        contentType: 'image/jpeg',
      })
      .expect(204);

    await ownerAgent
      .put(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}/attributes`)
      .set('Idempotency-Key', randomUUID())
      .send({
        attributes: [
          {
            category_attribute_id: materialAttribute.id,
            selected_option_id: materialAttribute.options[0]?.id,
          },
        ],
      })
      .expect(200);

    const productDraftAfterInventoryResponse = await ownerAgent
      .get(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}`)
      .expect(200);
    const productInventoryId = (
      productDraftAfterInventoryResponse.body as {
        inventory: Array<{ id: string }>;
      }
    ).inventory[0]?.id;

    expect(productInventoryId).toEqual(expect.any(String));

    await seedPublishableInventory(sql, {
      shopId: shopBody.id,
      inventoryId: productInventoryId,
      sku: 'MUG-001',
      stock: 10,
      amountMinor: 1999,
      currency: 'USD',
    });

    await assignShippingProfile(ownerAgent, shopBody.id, productId);

    const publishResponse = await ownerAgent
      .post(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}/publish`)
      .set('Idempotency-Key', randomUUID())
      .expect(201);

    expect(publishResponse.body.state).toBe('active');

    const getProductResponse = await ownerAgent
      .get(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}`)
      .expect(200);

    expect(getProductResponse.body).toMatchObject({
      id: productId,
      state: 'active',
      shop_id: shopBody.id,
      category_id: categoryBody.id,
      title: 'Better Mug',
      slug: 'better-mug',
      description: 'Refined ceramic mug',
      who_made: ProductWhoMade.COLLECTIVE,
      is_digital: true,
      non_taxable: true,
      attributes: [
        {
          category_attribute_id: materialAttribute.id,
          selected_option_id: materialAttribute.options[0]?.id,
          selected_option_value: 'Ceramic',
        },
      ],
    });
    expect(getProductResponse.body.images).toHaveLength(1);
    expect(getProductResponse.body.inventory).toHaveLength(1);
    expect(getProductResponse.body.shipping.profile_name).toBe('Standard shipping');
    expect(getProductResponse.body.shipping.rates).toHaveLength(2);

    const secondProductResponse = await ownerAgent
      .post(`${API_PREFIX}/shops/${shopBody.id}/products`)
      .send({
        category_id: categoryBody.id,
        title: 'Stoneware Mug',
        description: 'Published stoneware mug',
        who_made: ProductWhoMade.I_DID,
      })
      .expect(201);

    await configureAndPublishProduct({
      productId: secondProductResponse.body.id,
      selectedOptionId: materialAttribute.options[1]?.id,
      sku: 'MUG-002',
      priceMinor: 2499,
    });


    const otherUserEmail = `commerce-other-${Date.now()}@example.com`;
    const otherAgent = request.agent(app.getHttpServer());
    await otherAgent
      .post(`${API_PREFIX}/auth/register`)
      .set('X-Forwarded-For', randomForwardedIp())
      .set('Idempotency-Key', randomUUID())
      .send({
        email: otherUserEmail,
        password: VALID_TEST_PASSWORD,
        displayName: 'Other Commerce Owner',
      })
      .expect(201);

    const otherShopResponse = await otherAgent
      .post(`${API_PREFIX}/shops`)
      .send({
        shop_name: `shop${Date.now().toString().slice(-5)}x`,
        currency: 'USD',
      })
      .expect(201);
    const otherShopBody = otherShopResponse.body as { id: string };

    await otherAgent
      .post(`${API_PREFIX}/shops/${otherShopBody.id}/products`)
      .set('Idempotency-Key', randomUUID())
      .send({
        category_id: categoryBody.id,
        title: 'Other Shop Mug',
        description: 'Different shop product',
        who_made: ProductWhoMade.I_DID,
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
      total_pages: 1,
      has_next_page: false,
      has_previous_page: false,
    });
    expect(listProductsResponse.body.items).toHaveLength(1);
    expect(listProductsResponse.body.items[0]).toMatchObject({
      id: productId,
      shop_id: shopBody.id,
      state: 'active',
      title: 'Better Mug',
      slug: 'better-mug',
    });
    expect(listProductsResponse.body.items[0].id).not.toBe(
      secondProductResponse.body.id,
    );
  });

  it('supports persistent carts and temp carts through the legacy-compatible user cart contract', async () => {
    const email = `commerce-cart-${Date.now()}@example.com`;
    const agent = request.agent(app.getHttpServer());

    const registerResponse = await agent
      .post(`${API_PREFIX}/auth/register`)
      .set('X-Forwarded-For', randomForwardedIp())
      .set('Idempotency-Key', randomUUID())
      .send({
        email,
        password: VALID_TEST_PASSWORD,
        displayName: 'Cart Owner',
      })
      .expect(201);
    const registerBody = registerResponse.body as unknown as AuthUserResponse;
    await grantSellerRole(registerBody.user.id);

    const shopResponse = await agent
      .post(`${API_PREFIX}/shops`)
      .send({
        shop_name: `cartshop${Date.now().toString().slice(-6)}`,
        currency: 'USD',
      })
      .expect(201);
    const shopBody = shopResponse.body as { id: string; shop_name: string };

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
      .set('Idempotency-Key', randomUUID())
      .send({
        category_id: categoryBody.id,
        title: 'Soup Bowl',
        description: 'Stoneware bowl',
        who_made: ProductWhoMade.I_DID,
      })
      .expect(201);
    const productId = productResponse.body.id as string;

    await agent
      .put(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}/images`)
      .attach('images', VALID_JPEG_BUFFER, {
        filename: 'bowl.jpg',
        contentType: 'image/jpeg',
      })
      .expect(204);

    const productDraftResponse = await agent
      .get(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}`)
      .expect(200);
    const inventoryId = (
      productDraftResponse.body as { inventory: Array<{ id: string }> }
    ).inventory[0]?.id;

    expect(inventoryId).toEqual(expect.any(String));

    await seedPublishableInventory(sql, {
      shopId: shopBody.id,
      inventoryId,
      sku: 'BOWL-001',
      stock: 8,
      amountMinor: 1250,
      currency: 'USD',
    });

    await assignShippingProfile(agent, shopBody.id, productId);

    await agent
      .post(`${API_PREFIX}/shops/${shopBody.id}/products/${productId}/publish`)
      .set('Idempotency-Key', randomUUID())
      .expect(201);

    const addCartResponse = await agent
      .post(`${API_PREFIX}/cart/items`)
      .send({
        inventory_id: inventoryId,
        quantity: 2,
      })
      .expect(201);

    expect(addCartResponse.body.cart).toMatchObject({
      user_id: expect.any(String),
      is_temp: false,
      total_quantity: 2,
    });
    expect(addCartResponse.body.cart.shop_groups).toHaveLength(1);
    expect(addCartResponse.body.cart.shop_groups[0]).toMatchObject({
      shop: {
        id: shopBody.id,
        name: shopBody.shop_name,
      },
      shipping_minor: 0,
      total_minor: 2500,
    });
    expect(addCartResponse.body.summary).toMatchObject({
      subtotal_minor: 2500,
      total_minor: 2500,
      total_selected_quantity: 2,
      total_quantity: 2,
    });

    const getCartResponse = await agent
      .get(`${API_PREFIX}/cart`)
      .expect(200);

    expect(getCartResponse.body.cart.shop_groups[0].items[0]).toMatchObject({
      quantity: 2,
      is_selected: true,
      product: {
        id: productId,
        title: 'Soup Bowl',
      },
      inventory: {
        id: inventoryId,
        amount_minor: 1250,
        currency: 'USD',
        stock: 8,
        sku: 'BOWL-001',
      },
    });

    const uncheckedCartResponse = await agent
      .patch(`${API_PREFIX}/cart/items`)
      .send({
        inventory_id: inventoryId,
        is_select_order: false,
      })
      .expect(200);

    expect(uncheckedCartResponse.body.summary).toMatchObject({
      subtotal_minor: 0,
      total_minor: 0,
      total_selected_quantity: 0,
    });
    expect(uncheckedCartResponse.body.cart.shop_groups[0].items[0].is_selected)
      .toBe(false);

    const updatedCartResponse = await agent
      .patch(`${API_PREFIX}/cart/items`)
      .send({
        inventory_id: inventoryId,
        quantity: 3,
        is_select_order: true,
      })
      .expect(200);

    expect(updatedCartResponse.body.summary).toMatchObject({
      subtotal_minor: 3750,
      total_minor: 3750,
      total_selected_quantity: 3,
      total_quantity: 3,
    });
    expect(updatedCartResponse.body.cart.shop_groups[0].items[0].quantity)
      .toBe(3);

    const tempCartResponse = await agent
      .post(`${API_PREFIX}/cart/items`)
      .send({
        inventory_id: inventoryId,
        quantity: 1,
        is_temp: true,
      })
      .expect(201);

    const tempCartId = tempCartResponse.body.cart.id as string;
    expect(tempCartResponse.body.cart.is_temp).toBe(true);
    expect(tempCartResponse.body.summary.total_minor).toBe(1250);

    const getTempCartResponse = await agent
      .get(`${API_PREFIX}/cart`)
      .query({
        cart_id: tempCartId,
      })
      .expect(200);

    expect(getTempCartResponse.body.cart.id).toBe(tempCartId);
    expect(getTempCartResponse.body.cart.shop_groups[0].items[0].quantity).toBe(1);

    const updatedTempCartResponse = await agent
      .patch(`${API_PREFIX}/cart/items`)
      .send({
        cart_id: tempCartId,
        inventory_id: inventoryId,
        quantity: 2,
      })
      .expect(200);

    expect(updatedTempCartResponse.body.summary.total_minor).toBe(2500);
    expect(updatedTempCartResponse.body.cart.id).toBe(tempCartId);

    const deletedRegularCartResponse = await agent
      .delete(`${API_PREFIX}/cart/items`)
      .query({
        inventory_id: inventoryId,
      })
      .expect(200);

    expect(deletedRegularCartResponse.body).toMatchObject({
      cart: null,
      summary: {
        total_minor: 0,
        total_selected_quantity: 0,
        total_quantity: 0,
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
