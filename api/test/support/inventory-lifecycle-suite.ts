import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from 'pg';
import { MikroORM } from '@mikro-orm/postgresql';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import request from 'supertest';
import type { Agent } from 'supertest';
import type { App } from 'supertest/types';
import type * as BootstrapAppModule from '~/bootstrap/app.module';
import { GlobalExceptionFilter } from '~/platform/filters/global-exception.filter';
import { validationExceptionFactory } from '~/platform/pipes/validation-exception.factory';
import { RequestLoggingInterceptor } from '~/platform/logging/request-logging.interceptor';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';
import { OrderInventoryOutboxPublisherService } from '~/domains/order/app/services/order-inventory-outbox-publisher.service';
import { PermissionEntity } from '~/domains/auth/infra/persistence/entities/permission.entity';
import { RolePermissionEntity } from '~/domains/auth/infra/persistence/entities/role-permission.entity';
import { RoleEntity } from '~/domains/auth/infra/persistence/entities/role.entity';
import {
  PaymentGateway,
  type CreateCheckoutSessionInput,
  type PaymentWebhookEvent,
} from '~/integrations/payment/app/ports/payment-gateway';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { LocalFileStorageService } from '~/integrations/storage/infra/local-file-storage.service';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import type {
  AppJobName,
  AppJobPayloadMap,
  DispatchJobOptions,
} from '~/platform/jobs/app-job.types';
import { ObservabilityService } from '~/platform/observability/observability.service';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { createTestDatabase, dropTestDatabase, type TestDatabaseContext } from './test-postgres';
import { seedAuthReferenceData } from '../../database/seeds/auth.seed';
import {
  assignProductShippingProfile, resolveProductId, resolveShopId, seedShopShippingProfile, 
} from './shipping-fixtures';

jest.setTimeout(180_000);

const API_PREFIX = '/v1';
const VALID_TEST_PASSWORD = 'Password123!';

const GO_SERVICE_DIR = path.resolve(__dirname, '../../../inventory-service');
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@127.0.0.1:5672';

type InventoryMode = 'local' | 'remote';

type TestSeller = {
  agent: Agent; email: string; shopId: string; shopPublicId: string 
};
type SeededProduct = { productId: string; inventoryId: string };

type PoolRow = {
  id: string;
  on_hand_quantity: number;
  reserved_quantity: number;
  on_hand_version: number;
  stock: number;
};

type MovementRow = {
  movement_kind: string;
  quantity_delta: number;
  on_hand_before: number;
  on_hand_after: number;
  reserved_before: number;
  reserved_after: number;
  stock_pool_id: string;
};

type OrderShop = { id: string; order_number: string };

function randomForwardedIp(): string {
  return `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
}

function restoreProcessEnv(originalEnv: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    }
    else {
      process.env[key] = value;
    }
  }
}

async function canConnect(host: string, port: number): Promise<boolean> {
  const socket = net.createConnection({ host, port });
  const connected = await Promise.race([
    once(socket, 'connect').then(() => true),
    delay(1500).then(() => false),
  ]).catch(() => false);
  socket.destroy();

  return connected;
}

async function freePort(): Promise<number> {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  server.close();
  await once(server, 'close');

  return port;
}

async function waitForHealthz(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`healthz returned ${response.status}`);
    }
    catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(`inventory-service did not become ready: ${String(lastError)}`);
}

/**
 * Background jobs (catalog projection, notification emails, delayed cleanup) are
 * outside this suite's subject. The inline driver would otherwise run the Mongo
 * catalog projector inside the request, which is unrelated to inventory authority.
 */
class NoopJobDispatcher extends JobDispatcher {
  async dispatch<TName extends AppJobName>(
    _name: TName,
    _payload: AppJobPayloadMap[TName],
    _options?: DispatchJobOptions,
  ): Promise<void> {}
}

/**
 * In-memory payment double. It never fabricates inventory truth: card sessions
 * and webhook events are the only things it stands in for, while reservation,
 * consumption, and restoration keep flowing through the configured Inventory
 * authority (local tables or the real Go service).
 */
class FakePaymentGateway extends PaymentGateway {
  private nextEvent: PaymentWebhookEvent | null = null;

  queueEvent(event: PaymentWebhookEvent): void {
    this.nextEvent = event;
  }

  async createCheckoutSession(_input: CreateCheckoutSessionInput): Promise<{
    id: string;
    url: string;
    expiresAt?: Date;
  }> {
    const id = `cs_test_${randomUUID().replace(/-/g, '')}`;

    return {
      id,
      url: `https://pay.test/${id}`,
      expiresAt: new Date(Date.now() + (60 * 60 * 1000)),
    };
  }

  constructWebhookEvent(_payload: Buffer, _signature?: string): PaymentWebhookEvent {
    if (!this.nextEvent) {
      throw new Error('No webhook event queued on FakePaymentGateway');
    }

    const event = this.nextEvent;
    this.nextEvent = null;

    return event;
  }

  async retrieveCheckoutSession(sessionId: string): Promise<{
    id: string;
    status: string;
    paymentStatus: string;
  }> {
    return { id: sessionId, status: 'complete', paymentStatus: 'paid' };
  }

  async createRefund(): Promise<{ id: string; status: string; amount: number }> {
    return { id: 're_test', status: 'succeeded', amount: 0 };
  }
}

/**
 * Declares the lifecycle suite for one inventory driver. Callers run each mode in
 * its own Jest test file: AppModule caches its MikroORM options at first require,
 * so two drivers in one module registry would both bind the first driver's DB.
 */
// eslint-disable-next-line max-lines-per-function
export function defineInventoryLifecycleSuite(
  mode: InventoryMode,
  options: { remoteEnabled: boolean },
): void {
  const describeMode = options.remoteEnabled ? describe : describe.skip;

  // eslint-disable-next-line max-lines-per-function
  describeMode(`Inventory lifecycle (${mode} driver)`, () => {
    let originalEnv: NodeJS.ProcessEnv;
    let testDb: TestDatabaseContext;
    let storageRoot: string;
    let sql: Client;
    let app: INestApplication<App>;
    let gateway: FakePaymentGateway;
    let outboxPublisher: OrderInventoryOutboxPublisherService;

    let goProcess: ChildProcess | undefined;
    let goServiceUrl = '';
    let goLogs = '';

    async function startInventoryService(): Promise<void> {
      if (!(await canConnect('127.0.0.1', 5672))) {
        throw new Error('RabbitMQ is not reachable at 127.0.0.1:5672');
      }

      const port = await freePort();
      const binaryPath = path.join(storageRoot, 'inventory-service');
      const env = {
        ...process.env,
        PORT: String(port),
        DATABASE_URL: `postgres://${testDb.rootConfig.user}:${testDb.rootConfig.password}@${testDb.rootConfig.host}:${testDb.rootConfig.port}/${testDb.dbName}?sslmode=disable`,
        RABBITMQ_URL,
        RABBITMQ_DOMAIN_EVENTS_EXCHANGE: 'arc.domain-events',
        RABBITMQ_INVENTORY_ORDER_EVENTS_QUEUE: `inventory.order-events.${testDb.dbName}`,
      };

      await new Promise<void>((resolve, reject) => {
        const build = spawn('go', ['build', '-o', binaryPath, './cmd/inventory-service'], {
          cwd: GO_SERVICE_DIR,
          env,
          stdio: 'pipe',
        });
        let stderr = '';
        build.stderr?.on('data', (chunk) => {
          stderr += String(chunk);
        });
        build.once('error', reject);
        build.once('exit', (code) => {
          if (code === 0) {
            resolve();
          }
          else {
            reject(new Error(`go build failed (${code}): ${stderr}`));
          }
        });
      });

      goProcess = spawn(binaryPath, [], { env, stdio: 'pipe' });
      goProcess.stderr?.on('data', (chunk) => {
        goLogs = `${goLogs}${String(chunk)}`.slice(-4000);
      });
      goProcess.stdout?.on('data', (chunk) => {
        goLogs = `${goLogs}${String(chunk)}`.slice(-4000);
      });

      goServiceUrl = `http://127.0.0.1:${port}`;
      await waitForHealthz(goServiceUrl, 20_000);
    }

    beforeAll(async () => {
      originalEnv = { ...process.env };
      testDb = await createTestDatabase(`inventory_lifecycle_${mode}`);
      storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-inventory-lifecycle-'));

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
      // Cookie-authenticated supertest requests need a non-Secure cookie to be
      // stored over plain HTTP.
      process.env.AUTH_COOKIE_SAME_SITE = 'lax';
      process.env.AUTH_COOKIE_SECURE = 'false';
      process.env.RATE_LIMIT_DRIVER = 'memory';
      process.env.RATE_LIMIT_LIMIT = '10000';
      process.env.MAIL_DRIVER = 'logger';
      process.env.STORAGE_DRIVER = 'local';
      process.env.STORAGE_LOCAL_ROOT = storageRoot;
      process.env.INVENTORY_RESERVATION_DRIVER = mode;

      if (mode === 'remote') {
        process.env.QUEUE_DRIVER = 'redis';
        process.env.RABBITMQ_URL = RABBITMQ_URL;
        process.env.RABBITMQ_DOMAIN_EVENTS_EXCHANGE = 'arc.domain-events';
        process.env.RABBITMQ_INVENTORY_ORDER_EVENTS_QUEUE = `inventory.order-events.${testDb.dbName}`;
      }
      else {
        process.env.QUEUE_DRIVER = 'inline';
      }

      sql = new Client({
        host: testDb.rootConfig.host,
        port: testDb.rootConfig.port,
        user: testDb.rootConfig.user,
        password: testDb.rootConfig.password,
        database: testDb.dbName,
      });
      await sql.connect();


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

      if (mode === 'remote') {
        await startInventoryService();
        process.env.INVENTORY_SERVICE_BASE_URL = goServiceUrl;
      }

      // AppModule must load after the throwaway database env is applied.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { AppModule } = require('~/bootstrap/app.module') as typeof BootstrapAppModule;

      gateway = new FakePaymentGateway();

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
        .overrideProvider(PaymentGateway)
        .useValue(gateway)
        .overrideProvider(JobDispatcher)
        .useValue(new NoopJobDispatcher())
        .compile();

      app = moduleFixture.createNestApplication();
      app.getHttpAdapter().getInstance().set('trust proxy', true);
      app.enableShutdownHooks();
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          transform: true,
          forbidNonWhitelisted: true,
          exceptionFactory: validationExceptionFactory,
        }),
      );
      const exceptionLogger = await app.resolve(PinoLogger);
      const requestLogger = await app.resolve(PinoLogger);
      app.useGlobalFilters(
        new GlobalExceptionFilter(app.get(RequestContextService), exceptionLogger),
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

      outboxPublisher = app.get(OrderInventoryOutboxPublisherService);
    });

    afterAll(async () => {
      if (app) {
        await app.close();
      }

      if (goProcess) {
        const exitCode = goProcess.exitCode;
        if (exitCode !== null && exitCode !== 0) {
          // Surface the authority's own logs when it died unexpectedly.
          process.stderr.write(`inventory-service exited with ${exitCode}:\n${goLogs}\n`);
        }
        goProcess.kill('SIGKILL');
      }

      if (sql) {
        await sql.end();
      }

      restoreProcessEnv(originalEnv);

      if (storageRoot) {
        await rm(storageRoot, { recursive: true, force: true });
      }

      if (testDb) {
        await dropTestDatabase(testDb);
      }
    });

    async function createSeller(): Promise<TestSeller> {
      const agent = request.agent(app.getHttpServer());
      const email = `seller-${mode}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`;

      const registerResponse = await agent
        .post(`${API_PREFIX}/auth/register`)
        .set('Idempotency-Key', randomUUID())
        .set('X-Forwarded-For', randomForwardedIp())
        .send({ email, password: VALID_TEST_PASSWORD, displayName: 'Seller' })
        .expect(201);

      const sellerRole = await sql.query('select "id" from "roles" where "key" = \'seller\'');
      await sql.query(
        `insert into "user_roles" ("id", "created_at", "updated_at", "assigned_at", "user_id", "role_id")
         values ($1, now(), now(), now(), $2, $3)`,
        [randomUUID(), registerResponse.body.user.id, sellerRole.rows[0].id],
      );

      const shopResponse = await agent
        .post(`${API_PREFIX}/shops`)
        .set('Idempotency-Key', randomUUID())
        .send({
          shop_name: `shop${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
          currency: 'USD',
        })
        .expect(201);

      return {
        agent, email, shopId: shopResponse.body.id as string, shopPublicId: shopResponse.body.id as string, 
      };
    }

    async function seedCategory(seller: TestSeller): Promise<string> {
      const response = await seller.agent
        .post(`${API_PREFIX}/categories`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: `Inventory ${mode} ${randomUUID().slice(0, 8)}`, rank: 1 })
        .expect(201);

      return response.body.id as string;
    }

    async function seedPublishedProduct(input: {
      seller: TestSeller;
      stock: number;
      priceMinor: number;
    }): Promise<SeededProduct> {
      const productResponse = await input.seller.agent
        .post(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products`)
        .set('Idempotency-Key', randomUUID())
        .send({
          category_id: await seedCategory(input.seller),
          title: `Inventory product ${randomUUID().slice(0, 8)}`,
          description: 'Inventory lifecycle product',
          who_made: ProductWhoMade.I_DID,
        })
        .expect(201);
      const productId = productResponse.body.id as string;
      const productPublicId = productResponse.body.id as string;

      const draftResponse = await input.seller.agent
        .get(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products/${productPublicId}`)
        .expect(200);
      const variantId = draftResponse.body.variants[0].id as string;

      const existingInventory = await sql.query(
        'select "id" from "product_inventory" where "product_variant_id" = $1',
        [variantId],
      );
      const inventoryId = (existingInventory.rows[0]?.id as string | undefined) ?? randomUUID();
      const internalShopId = await resolveShopId(sql, input.seller.shopId);
      const internalProductId = await resolveProductId(sql, productId);

      if (existingInventory.rows.length === 0) {
        await sql.query(
          `insert into "product_inventory"
             ("id", "created_at", "updated_at", "shop_id", "product_id", "product_variant_id", "sku", "stock", "on_hand_quantity", "reserved_quantity", "on_hand_version", "lifecycle_state")
           values ($1, now(), now(), $2, $3, $4, $5, $6, $6, 0, 1, 'active')`,
          [inventoryId, internalShopId, internalProductId, variantId, `INV-${randomUUID().slice(0, 8)}`, input.stock],
        );
      }
      else {
        await sql.query(
          `update "product_inventory"
           set "stock" = $2, "on_hand_quantity" = $2, "reserved_quantity" = 0, "on_hand_version" = 1, "lifecycle_state" = 'active', "removed_at" = null, "updated_at" = now()
           where "id" = $1`,
          [inventoryId, input.stock],
        );
      }

      // A default seller Stock Pool is the authoritative balance holder. It mirrors
      // how the migration and the Inventory command repository seed new inventory.
      const existingPool = await sql.query(
        'select "id" from "product_stock_pool" where "inventory_id" = $1 and "is_default" = true',
        [inventoryId],
      );

      if (existingPool.rows.length === 0) {
        await sql.query(
          `insert into "product_stock_pool"
             ("id", "created_at", "updated_at", "inventory_id", "shop_id", "name", "custody", "is_default", "lifecycle_state", "on_hand_quantity", "reserved_quantity", "on_hand_version", "stock")
           values ($1, now(), now(), $2, $3, 'Default seller pool', 'seller', true, 'active', $4, 0, 1, $4)`,
          [randomUUID(), inventoryId, internalShopId, input.stock],
        );
      }
      else {
        await sql.query(
          `update "product_stock_pool"
           set "on_hand_quantity" = $2, "reserved_quantity" = 0, "on_hand_version" = 1, "stock" = $2, "updated_at" = now()
           where "id" = $1`,
          [existingPool.rows[0].id, input.stock],
        );
      }

      await sql.query('delete from "variant_prices" where "product_inventory_id" = $1', [inventoryId]);
      await sql.query(
        `insert into "variant_prices"
           ("id", "product_inventory_id", "price_type", "market_code", "currency", "amount_minor", "active_from", "created_at", "updated_at")
         values ($1, $2, 'base', null, 'USD', $3, now(), now(), now())`,
        [randomUUID(), inventoryId, input.priceMinor],
      );

      const profileId = await seedShopShippingProfile(sql, {
        shopId: input.seller.shopId,
        name: `Lifecycle shipping ${productId.slice(0, 8)}`,
        rates: [
          {
            destinationScope: 'country',
            destinationCountry: 'US',
            oneItemFeeMinor: 599,
            additionalItemFeeMinor: 199,
          },
        ],
      });
      await assignProductShippingProfile(sql, productId, profileId);

      await sql.query(
        'update "products" set "state" = \'active\', "updated_at" = now() where "id" = $1',
        [productId],
      );

      return { productId, inventoryId };
    }

    async function readPool(inventoryId: string): Promise<PoolRow> {
      const rows = await sql.query(
        `select "id", "on_hand_quantity", "reserved_quantity", "on_hand_version", "stock"
         from "product_stock_pool"
         where "inventory_id" = $1 and "is_default" = true`,
        [inventoryId],
      );

      return rows.rows[0] as PoolRow;
    }

    async function readMovements(inventoryId: string): Promise<MovementRow[]> {
      const rows = await sql.query(
        `select "movement_kind", "quantity_delta", "on_hand_before", "on_hand_after", "reserved_before", "reserved_after", "stock_pool_id"
         from "inventory_movements"
         where "inventory_id" = $1
         order by "created_at" asc, "movement_kind" asc`,
        [inventoryId],
      );

      return rows.rows as MovementRow[];
    }

    async function readReservationStatus(reservationId: string): Promise<string> {
      await waitForReservation(reservationId, (status) => status.length > 0, 1000);
      const rows = await sql.query(
        'select "status" from "inventory_reservations" where "id" = $1',
        [reservationId],
      );

      return rows.rows[0]?.status as string;
    }

    async function waitForReservation(
      reservationId: string,
      predicate: (status: string) => boolean,
      timeoutMs = 20_000,
    ): Promise<string> {
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        const rows = await sql.query(
          'select "status" from "inventory_reservations" where "id" = $1',
          [reservationId],
        );

        const status = rows.rows[0]?.status as string | undefined;
        if (status && predicate(status)) {
          return status;
        }

        await delay(200);
      }

      const rows = await sql.query(
        'select "status" from "inventory_reservations" where "id" = $1',
        [reservationId],
      );

      throw new Error(`Reservation ${reservationId} did not reach the expected state; last=${rows.rows[0]?.status}`);
    }

    async function waitForPool(
      inventoryId: string,
      predicate: (pool: PoolRow) => boolean,
      timeoutMs = 20_000,
    ): Promise<PoolRow> {
      const deadline = Date.now() + timeoutMs;
      let last: PoolRow | undefined;

      while (Date.now() < deadline) {
        last = await readPool(inventoryId);
        if (predicate(last)) {
          return last;
        }

        await delay(200);
      }

      throw new Error(`Pool for ${inventoryId} did not reach the expected state; last=${JSON.stringify(last)}`);
    }

    async function publishOrderCreatedOutbox(): Promise<void> {
      if (mode === 'local') {
        return;
      }

      await outboxPublisher.processPendingEvents();
    }

    async function readOrderReservationId(orderPublicId: string): Promise<string | undefined> {
      const rows = await sql.query(
        'select "payment_details"->>\'reservation_id\' as "reservation_id" from "orders" where "public_id" = $1',
        [orderPublicId],
      );

      return rows.rows[0]?.reservation_id as string | undefined;
    }

    async function readOrderSessionId(orderPublicId: string): Promise<string> {
      const rows = await sql.query(
        'select "payment_details"->>\'checkout_session_id\' as "session_id" from "orders" where "public_id" = $1',
        [orderPublicId],
      );

      return rows.rows[0]?.session_id as string;
    }

    async function readLocalReservationStatus(inventoryId: string): Promise<string> {
      const rows = await sql.query(
        `select "status" from "checkout_stock_reservations"
         where "inventory_id" = $1
         order by "created_at" desc
         limit 1`,
        [inventoryId],
      );

      return rows.rows[0]?.status as string;
    }

    async function placeGuestOrder(input: {
      inventoryId: string;
      quantity: number;
      paymentType: 'cash' | 'card';
    }): Promise<{
      orderId: string; orderPublicId: string; quoteId: string; reservationId?: string; sessionId?: string
    }> {
      const agent = request.agent(app.getHttpServer());

      const cartResponse = await agent
        .post(`${API_PREFIX}/cart/items`)
        .set('X-Forwarded-For', randomForwardedIp())
        .send({ inventory_id: input.inventoryId, quantity: input.quantity, is_temp: true })
        .expect(201);

      const cartId = cartResponse.body.cart.id as string;

      const quoteResponse = await agent
        .post(`${API_PREFIX}/checkout/buy-now/quote`)
        .set('X-Forwarded-For', randomForwardedIp())
        .send({
          cart_id: cartId,
          presentment_currency: 'USD',
          shipping_address: {
            full_name: 'Guest Buyer',
            address_1: '1 Test Street',
            city: 'Portland',
            state: 'OR',
            zip: '97201',
            country: 'US',
            phone: '+15550000002',
          },
        })
        .expect(201);

      const quoteId = quoteResponse.body.quote_id as string;

      const orderResponse = await agent
        .post(`${API_PREFIX}/checkout/buy-now`)
        .set('X-Forwarded-For', randomForwardedIp())
        .send({
          payment_type: input.paymentType,
          quote_id: quoteId,
          guest: { email: `guest-${mode}-${Date.now()}@example.com` },
        })
        .expect(201);

      const orderShop = orderResponse.body.order_shops[0] as OrderShop;
      const orderId = orderShop.id;
      const orderPublicId = orderShop.id;
      const reservationId = mode === 'remote'
        ? await readOrderReservationId(orderPublicId)
        : undefined;
      const sessionId = input.paymentType === 'card'
        ? await readOrderSessionId(orderPublicId)
        : undefined;

      if (input.paymentType === 'cash') {
        // Remote cash consumption is driven by the order.created outbox;
        // local mode consumes inline during order creation.
        await publishOrderCreatedOutbox();
      }

      return {
        orderId, orderPublicId, quoteId, reservationId, sessionId,
      };
    }

    async function completeCardSession(orderId: string, sessionId: string): Promise<void> {
      gateway.queueEvent({
        id: `evt_${randomUUID()}`,
        type: 'checkout.session.completed',
        data: { object: { id: sessionId, paymentStatus: 'paid', paymentIntentId: `pi_${randomUUID()}` } },
      });

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/webhooks/stripe`)
        .send({ type: 'checkout.session.completed' })
        .expect(201);

      await publishOrderCreatedOutbox();
    }

    async function expireCardSession(sessionId: string): Promise<void> {
      gateway.queueEvent({
        id: `evt_${randomUUID()}`,
        type: 'checkout.session.expired',
        // The production gateway converts Stripe's unix `expires_at` into a Date;
        // this double leaves it unset so the caller records its own expiry time.
        data: { object: { id: sessionId, status: 'expired' } },
      });

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/webhooks/stripe`)
        .send({ type: 'checkout.session.expired' })
        .expect(201);
    }

    async function cancelOrder(seller: TestSeller, orderPublicId: string): Promise<void> {
      await seller.agent
        .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${orderPublicId}/status`)
        .send({ status: 'canceled', cancel_reason: 'inventory verification' })
        .expect(200);
    }

    it('consumes a cash purchase exactly once and records reserve then sale', async () => {
      const seller = await createSeller();
      const { inventoryId } = await seedPublishedProduct({ seller, stock: 5, priceMinor: 1999 });

      const { orderPublicId } = await placeGuestOrder({ inventoryId, quantity: 2, paymentType: 'cash' });

      const pool = mode === 'local'
        ? await readPool(inventoryId)
        : await waitForPool(inventoryId, (current) => current.on_hand_quantity === 3 && current.reserved_quantity === 0);

      expect(pool).toMatchObject({
        on_hand_quantity: 3,
        reserved_quantity: 0,
        on_hand_version: 1,
        stock: 3,
      });

      const movements = await readMovements(inventoryId);
      const saleMovements = movements.filter((movement) => movement.movement_kind === 'sale');
      expect(saleMovements).toHaveLength(1);
      expect(saleMovements[0]).toMatchObject({
        quantity_delta: -2,
        on_hand_before: 5,
        on_hand_after: 3,
        reserved_before: 2,
        reserved_after: 0,
        stock_pool_id: pool.id,
      });

      const reserveMovements = movements.filter((movement) => movement.movement_kind === 'reserve');
      expect(reserveMovements).toHaveLength(1);
      expect(reserveMovements[0]).toMatchObject({
        quantity_delta: 2,
        reserved_before: 0,
        reserved_after: 2,
        stock_pool_id: pool.id,
      });

      // Reservation activity never changes the On-hand Version.
      expect(pool.on_hand_version).toBe(1);

      const orderRead = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${orderPublicId}`)
        .expect(200);
      expect(orderRead.body.order.status).toBe('pending');
    });

    it('rejects a quantity the recorded pool cannot satisfy without leaving a partial hold', async () => {
      const seller = await createSeller();
      const { inventoryId } = await seedPublishedProduct({ seller, stock: 2, priceMinor: 1999 });

      const agent = request.agent(app.getHttpServer());
      const cartResponse = await agent
        .post(`${API_PREFIX}/cart/items`)
        .set('X-Forwarded-For', randomForwardedIp())
        .send({ inventory_id: inventoryId, quantity: 2, is_temp: true })
        .expect(201);

      // Depleting the pool also depletes the derived aggregate, so the hold is
      // refused by the authoritative balance rather than by a stale read.
      await sql.query(
        `update "product_stock_pool"
         set "on_hand_quantity" = 1, "stock" = 1, "updated_at" = now()
         where "inventory_id" = $1 and "is_default" = true`,
        [inventoryId],
      );

      await agent
        .post(`${API_PREFIX}/checkout/buy-now/quote`)
        .set('X-Forwarded-For', randomForwardedIp())
        .send({
          cart_id: cartResponse.body.cart.id,
          presentment_currency: 'USD',
          shipping_address: {
            full_name: 'Guest Buyer',
            address_1: '1 Test Street',
            city: 'Portland',
            state: 'OR',
            zip: '97201',
            country: 'US',
            phone: '+15550000002',
          },
        })
        .expect(400);

      const pool = await readPool(inventoryId);
      expect(pool).toMatchObject({
        on_hand_quantity: 1,
        reserved_quantity: 0,
        on_hand_version: 1,
        stock: 1,
      });
      expect(await readMovements(inventoryId)).toHaveLength(0);
    });

    it('holds a card purchase until paid, then consumes once and ignores the replay', async () => {
      const seller = await createSeller();
      const { inventoryId } = await seedPublishedProduct({ seller, stock: 4, priceMinor: 1999 });

      const { orderId, sessionId } = await placeGuestOrder({
        inventoryId,
        quantity: 1,
        paymentType: 'card',
      });
      expect(sessionId).toBeTruthy();

      // Hold: reserved while on-hand is untouched.
      const held = await readPool(inventoryId);
      expect(held).toMatchObject({
        on_hand_quantity: 4, reserved_quantity: 1, on_hand_version: 1, stock: 3, 
      });

      await completeCardSession(orderId, sessionId!);

      const consumed = mode === 'local'
        ? await readPool(inventoryId)
        : await waitForPool(inventoryId, (current) => current.on_hand_quantity === 3 && current.reserved_quantity === 0);
      expect(consumed).toMatchObject({
        on_hand_quantity: 3, reserved_quantity: 0, on_hand_version: 1, stock: 3, 
      });

      // Replaying the completion must not consume a second unit. Re-queue the same
      // completed event and re-run the outbox/consumer path.
      gateway.queueEvent({
        id: `evt_${randomUUID()}`,
        type: 'checkout.session.completed',
        data: { object: { id: sessionId, paymentStatus: 'paid', paymentIntentId: 'pi_replay' } },
      });
      await request(app.getHttpServer())
        .post(`${API_PREFIX}/webhooks/stripe`)
        .send({ type: 'checkout.session.completed' })
        .expect(201);
      await outboxPublisher.processPendingEvents();

      const afterReplay = await readPool(inventoryId);
      expect(afterReplay).toMatchObject({ on_hand_quantity: 3, reserved_quantity: 0 });

      const saleMovements = (await readMovements(inventoryId))
        .filter((movement) => movement.movement_kind === 'sale');
      expect(saleMovements).toHaveLength(1);
    });

    it('releases an unpaid card hold on expiry without changing on-hand quantity', async () => {
      const seller = await createSeller();
      const { inventoryId } = await seedPublishedProduct({ seller, stock: 4, priceMinor: 1999 });

      const { sessionId } = await placeGuestOrder({
        inventoryId,
        quantity: 2,
        paymentType: 'card',
      });

      expect(await readPool(inventoryId)).toMatchObject({ on_hand_quantity: 4, reserved_quantity: 2 });

      await expireCardSession(sessionId!);

      const released = mode === 'local'
        ? await readPool(inventoryId)
        : await waitForPool(inventoryId, (current) => current.reserved_quantity === 0);
      expect(released).toMatchObject({
        on_hand_quantity: 4, reserved_quantity: 0, on_hand_version: 1, stock: 4, 
      });

      const movements = await readMovements(inventoryId);
      expect(movements.filter((movement) => movement.movement_kind === 'release')).toHaveLength(1);

      // Replaying expiry must not release twice.
      await expireCardSession(sessionId!);
      expect(await readPool(inventoryId)).toMatchObject({ on_hand_quantity: 4, reserved_quantity: 0 });
      expect(
        (await readMovements(inventoryId)).filter((movement) => movement.movement_kind === 'release'),
      ).toHaveLength(1);
    });

    it('restores consumed stock on whole-order cancellation exactly once', async () => {
      const seller = await createSeller();
      const { inventoryId } = await seedPublishedProduct({ seller, stock: 5, priceMinor: 1999 });

      const { orderPublicId } = await placeGuestOrder({ inventoryId, quantity: 2, paymentType: 'cash' });

      const consumed = mode === 'local'
        ? await readPool(inventoryId)
        : await waitForPool(inventoryId, (current) => current.on_hand_quantity === 3);
      expect(consumed).toMatchObject({ on_hand_quantity: 3, reserved_quantity: 0 });

      await cancelOrder(seller, orderPublicId);

      const restored = mode === 'local'
        ? await readPool(inventoryId)
        : await waitForPool(inventoryId, (current) => current.on_hand_quantity === 5);
      expect(restored).toMatchObject({
        on_hand_quantity: 5, reserved_quantity: 0, on_hand_version: 1, stock: 5, 
      });

      const corrections = (await readMovements(inventoryId))
        .filter((movement) => movement.movement_kind === 'correction');
      expect(corrections).toHaveLength(1);
      expect(corrections[0]).toMatchObject({ quantity_delta: 2, stock_pool_id: restored.id });

      const orderRead = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${orderPublicId}`)
        .expect(200);
      expect(orderRead.body.order.status).toBe('canceled');

      // Replaying the cancellation command must not restore the sale twice.
      await cancelOrder(seller, orderPublicId);
      expect(await readPool(inventoryId)).toMatchObject({ on_hand_quantity: 5, reserved_quantity: 0 });
      expect(
        (await readMovements(inventoryId)).filter((movement) => movement.movement_kind === 'correction'),
      ).toHaveLength(1);
    });

    it('records the reservation against the recorded default pool', async () => {
      const seller = await createSeller();
      const { inventoryId } = await seedPublishedProduct({ seller, stock: 3, priceMinor: 1999 });

      const { orderId, reservationId } = await placeGuestOrder({
        inventoryId,
        quantity: 1,
        paymentType: 'card',
      });
      expect(orderId).toBeTruthy();

      const pool = await readPool(inventoryId);

      if (mode === 'remote') {
        expect(reservationId).toBeTruthy();
        const item = await sql.query(
          'select "stock_pool_id" from "inventory_reservation_items" where "reservation_id" = $1',
          [reservationId],
        );
        expect(item.rows[0]?.stock_pool_id).toBe(pool.id);
        expect(await readReservationStatus(reservationId!)).toBe('ACTIVE');
      }
      else {
        const rows = await sql.query(
          `select csr."stock_pool_id" from "checkout_stock_reservations" csr
           join "orders" o on csr."order_id" = o."id"
           where o."public_id" = $1`,
          [orderId],
        );
        expect(rows.rows[0]?.stock_pool_id).toBe(pool.id);
        expect(await readLocalReservationStatus(inventoryId)).toBe('active');
      }
    });
  });
}
