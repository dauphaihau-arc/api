/**
 * Boots the real API over HTTP on a fresh migrated database for the seller
 * browser smoke. Registers a seller with a shop, seeds a parent/child category
 * with an attribute, and prints a JSON ready line the browser runner waits for.
 *
 * Run with:
 *   node -r ts-node/register/transpile-only -r tsconfig-paths/register \
 *     test/support/seller-e2e-api.ts
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Test } from '@nestjs/testing';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { LocalFileStorageService } from '~/integrations/storage/infra/local-file-storage.service';
import { validationExceptionFactory } from '~/platform/pipes/validation-exception.factory';
import { API_GLOBAL_PREFIX } from '~/platform/http/api-global-prefix';
import { MikroOrmCategoryCommandRepository } from '~/domains/category/infra/mikro-orm-category-command.repository';
import { CategoryIdentityGenerationInterceptor } from '~/domains/category/api/rest/category-identity-generation.interceptor';
import { PermissionEntity } from '~/domains/auth/infra/persistence/entities/permission.entity';
import { RoleEntity } from '~/domains/auth/infra/persistence/entities/role.entity';
import { RolePermissionEntity } from '~/domains/auth/infra/persistence/entities/role-permission.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { ShippingProfileEntity } from '~/domains/shipping/infra/persistence/entities/shipping-profile.entity';
import { ShippingProfileRateEntity } from '~/domains/shipping/infra/persistence/entities/shipping-profile-rate.entity';
import { ShippingProfileStatus } from '~/domains/shipping/domain/enums/shipping-profile-status.enum';
import { ShippingDestinationScope } from '~/domains/shipping/domain/enums/shipping-destination-scope.enum';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';
import { CreateProductDraftUseCase } from '~/domains/product/app/use-cases/create-product-draft/create-product-draft.use-case';
import { SetProductAttributesUseCase } from '~/domains/product/app/use-cases/set-product-attributes/set-product-attributes.use-case';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import type * as BootstrapAppModule from '~/bootstrap/app.module';
import { createTestDatabase, dropTestDatabase, type TestDatabaseContext } from './test-postgres';

const PORT = Number(process.env.SELLER_E2E_API_PORT ?? 4010);
const PREFIX = `/${API_GLOBAL_PREFIX}`;
const SELLER = {
  email: `seller-e2e-${Date.now()}@example.com`,
  password: 'Password123!',
  display_name: 'E2E Seller',
  shop_name: `E2E Shop ${Date.now()}`,
  currency: 'USD',
};

type HarnessResources = {
  app?: INestApplication;
  testDb?: TestDatabaseContext;
  storageRoot?: string;
};

const resources: HarnessResources = {};
let cleanupStarted = false;
let stopping = false;
const bootstrapAbort = new AbortController();

/**
 * Releases every resource this harness created. Safe to call more than once and
 * runs after boot/seed failures and signals as well as on the happy path.
 */
async function cleanup(): Promise<void> {
  if (cleanupStarted) {
    return;
  }

  cleanupStarted = true;

  const failures: unknown[] = [];

  if (resources.app) {
    try {
      await resources.app.close();
    }
    catch (error) {
      failures.push(error);
    }
  }

  if (resources.testDb) {
    try {
      await dropTestDatabase(resources.testDb);
    }
    catch (error) {
      failures.push(error);
    }
  }

  if (resources.storageRoot) {
    try {
      await rm(resources.storageRoot, { recursive: true, force: true });
    }
    catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    process.stderr.write(
      `SELLER_E2E_CLEANUP_ERROR ${failures.map(error => String((error as Error)?.stack ?? error)).join(' | ')}\n`,
    );
    throw new AggregateError(failures, 'seller e2e cleanup failed');
  }
}

async function main() {
  const testDb = await createTestDatabase('seller_e2e', {
    fresh: true,
    signal: bootstrapAbort.signal,
  });
  resources.testDb = testDb;
  if (stopping) {
    return;
  }

  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = testDb.rootConfig.host;
  process.env.DB_PORT = String(testDb.rootConfig.port);
  process.env.DB_USER = testDb.rootConfig.user;
  process.env.DB_PASSWORD = testDb.rootConfig.password;
  process.env.DB_NAME = testDb.dbName;
  // DATABASE_URL takes precedence over DB_* and may be loaded from .env.
  const databaseUrl = new URL('postgresql://localhost');
  databaseUrl.hostname = testDb.rootConfig.host.includes(':')
    ? `[${testDb.rootConfig.host}]`
    : testDb.rootConfig.host;
  databaseUrl.port = String(testDb.rootConfig.port);
  databaseUrl.username = encodeURIComponent(testDb.rootConfig.user);
  databaseUrl.password = encodeURIComponent(testDb.rootConfig.password);
  databaseUrl.pathname = testDb.dbName;
  process.env.DATABASE_URL = databaseUrl.toString();
  process.env.JWT_ACCESS_SECRET = 'seller-e2e-access-secret';
  process.env.JWT_REFRESH_SECRET = 'seller-e2e-refresh-secret';
  process.env.BCRYPT_SALT_ROUNDS = '4';
  process.env.CACHE_DRIVER = 'memory';
  process.env.RATE_LIMIT_DRIVER = 'memory';
  // The browser smoke drives reloads and probes; keep rate limiting on but
  // effectively unlimited so a throttled contract probe cannot look like an
  // unavailable backend.
  process.env.RATE_LIMIT_LIMIT = '100000';
  process.env.QUEUE_DRIVER = 'inline';
  process.env.MAIL_DRIVER = 'logger';
  process.env.STORAGE_DRIVER = 'local';
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'seller-e2e-api-'));
  resources.storageRoot = storageRoot;
  if (stopping) {
    return;
  }
  process.env.STORAGE_LOCAL_ROOT = storageRoot;

  // Serve auth cookies over plain HTTP so Chromium keeps them in the smoke.
  process.env.AUTH_COOKIE_SAME_SITE = 'lax';
  process.env.AUTH_COOKIE_SECURE = 'false';
  process.env.AUTH_COOKIE_PATH = '/';
  delete process.env.AUTH_COOKIE_DOMAIN;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require('~/bootstrap/app.module') as typeof BootstrapAppModule;

  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StorageService)
    .useValue(new LocalFileStorageService({ driver: 'local', localRoot: storageRoot }))
    .compile();

  const app = moduleFixture.createNestApplication();
  resources.app = app;
  if (stopping) {
    return;
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.setGlobalPrefix(PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });
  app.useGlobalInterceptors(new CategoryIdentityGenerationInterceptor());
  await app.listen(PORT);
  if (stopping) {
    return;
  }

  const base = `http://127.0.0.1:${PORT}${PREFIX}`;

  const registerResponse = await fetch(`${base}/seller/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
    },
    body: JSON.stringify(SELLER),
  });

  if (!registerResponse.ok) {
    throw new Error(`seller registration failed: ${registerResponse.status} ${await registerResponse.text()}`);
  }

  const entityManager = app.get(EntityManager);
  const storageService = app.get(StorageService);

  // A fresh database has no seeded roles/permissions; grant the seller role the
  // permissions the seller app requires so the authenticated UI can operate.
  const permissionEm = entityManager.fork();
  const sellerRole = await permissionEm.findOneOrFail(RoleEntity, { key: 'seller' });
  for (const permissionKey of ['shops.create', 'shops.manage']) {
    let permission = await permissionEm.findOne(PermissionEntity, { key: permissionKey });
    permission ??= permissionEm.create(PermissionEntity, { key: permissionKey, name: permissionKey });
    permissionEm.persist(permission);
    permissionEm.persist(permissionEm.create(RolePermissionEntity, {
      role: sellerRole,
      permission,
      grantedAt: new Date(),
    }));
  }
  await permissionEm.flush();

  const shop = await entityManager.fork().findOneOrFail(ShopEntity, {
    ownerUser: { email: SELLER.email },
  });

  const shippingEm = entityManager.fork();
  const shippingProfile = shippingEm.create(ShippingProfileEntity, {
    shop,
    name: 'E2E Standard',
    normalizedName: 'e2e-standard',
    status: ShippingProfileStatus.ACTIVE,
    isDefault: true,
    shipFromCountry: 'US',
    shipFromPostal: '90001',
    processingTimeMinDays: 1,
    processingTimeMaxDays: 2,
  });
  shippingEm.persist(shippingProfile);
  shippingEm.persist(shippingEm.create(ShippingProfileRateEntity, {
    shippingProfile,
    position: 1,
    destinationScope: ShippingDestinationScope.EVERYWHERE_ELSE,
    oneItemFeeMinor: 500,
    additionalItemFeeMinor: 200,
    deliveryTimeMinDays: 3,
    deliveryTimeMaxDays: 7,
  }));
  await shippingEm.flush();

  const categoryRepository = new MikroOrmCategoryCommandRepository(entityManager, storageService);
  const root = await categoryRepository.create({ name: 'Apparel', rank: 1 });
  const child = await categoryRepository.create({ parentId: root.id, name: 'Shirts', rank: 1 });
  const childWithAttributes = await categoryRepository.createAttribute({
    categoryId: child.id,
    name: 'Size',
    options: [
      { value: 'Small', rank: 1 },
      { value: 'Medium', rank: 2 },
      { value: 'Large', rank: 3 },
    ],
  });

  const sizeAttribute = childWithAttributes?.attributes.find(attribute => attribute.name === 'Size');
  const mediumOption = sizeAttribute?.options?.find(option => option.value === 'Medium');

  if (!sizeAttribute || !mediumOption) {
    throw new Error('failed to seed the Size attribute fixture');
  }

  // A stable, real fixture product (draft, child category, "Size: Medium") so the
  // blocked-edit browser journey can open a product that genuinely exists and
  // pre-dates the blocked session, rather than a fake stub.
  const sellerUser = await entityManager.fork().findOneOrFail(UserEntity, { email: SELLER.email });
  const actor: AuthenticatedUser = {
    userId: sellerUser.id,
    email: SELLER.email,
    status: UserStatus.ACTIVE,
    sessionId: 'seller-e2e-fixture',
    roles: ['seller'],
    permissions: ['shops.manage'],
  };

  const fixtureDraft = await app.get(CreateProductDraftUseCase).execute(actor, {
    shopId: shop.id,
    categoryId: child.publicId,
    title: 'E2E Fixture Shirt',
    description: 'Draft fixture created by the seller e2e harness.',
    whoMade: ProductWhoMade.I_DID,
  });

  if (!fixtureDraft.isOk) {
    throw new Error(`fixture draft failed: ${fixtureDraft.error.message}`);
  }

  const fixtureWithAttributes = await app.get(SetProductAttributesUseCase).execute(actor, fixtureDraft.value.id, {
    attributes: [{ categoryAttributeId: sizeAttribute.id, selectedOptionId: mediumOption.id }],
  });

  if (!fixtureWithAttributes.isOk) {
    throw new Error(`fixture attributes failed: ${fixtureWithAttributes.error.message}`);
  }

  const readyPayload = {
    origin: `http://127.0.0.1:${PORT}`,
    fixtures: {
      seller: { email: SELLER.email, password: SELLER.password },
      shopPublicId: shop.publicId,
      rootCategoryPublicId: root.publicId,
      childCategoryPublicId: child.publicId,
      fixtureProductPublicId: fixtureWithAttributes.value.publicId,
      fixtureProductTitle: 'E2E Fixture Shirt',
    },
  };

  process.stdout.write(`SELLER_E2E_READY ${JSON.stringify(readyPayload)}\n`);
}

const startup = main();

function stop(code: number): void {
  if (stopping) {
    return;
  }

  stopping = true;
  bootstrapAbort.abort();
  // Wait for in-flight acquisition to publish its resources before cleanup.
  void startup.catch(() => undefined).then(cleanup).then(
    () => process.exit(code),
    () => process.exit(1),
  );
}

process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));

void startup.catch((error) => {
  process.stderr.write(`SELLER_E2E_FAILED ${String(error?.stack ?? error)}\n`);
  stop(1);
});
