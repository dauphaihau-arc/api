import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '~/platform/pipes/validation-exception.factory';
import {
  CATEGORY_IDENTITY_GENERATION_HEADER,
  CategoryIdentityGenerationInterceptor,
} from '~/domains/category/api/rest/category-identity-generation.interceptor';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import { CATEGORY_IDENTITY_CONTRACT_VERSION } from '~/domains/category/app/category-identity-contract';
import { EntityManager } from '@mikro-orm/postgresql';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { LocalFileStorageService } from '~/integrations/storage/infra/local-file-storage.service';
import type { CategoryRepository } from '~/domains/category/app/ports/category.repository';
import { MikroOrmCategoryCommandRepository } from '~/domains/category/infra/mikro-orm-category-command.repository';
import { MikroOrmCategoryQueryRepository } from '~/domains/category/infra/mikro-orm-category-query.repository';
import { CreateCategoryUseCase } from '~/domains/category/app/use-cases/create-category/create-category.use-case';
import { MikroOrmProductCommandRepository } from '~/domains/product/infra/persistence/mikro-orm/repositories/mikro-orm-product-command.repository';
import { MikroOrmSellerProductQueryRepository } from '~/domains/product/infra/persistence/mikro-orm/repositories/mikro-orm-seller-product-query.repository';
import { CreateProductDraftUseCase } from '~/domains/product/app/use-cases/create-product-draft/create-product-draft.use-case';
import { ListShopProductsUseCase } from '~/domains/product/app/use-cases/list-shop-products/list-shop-products.use-case';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';
import { ProductState } from '~/domains/product/domain/enums/product-state.enum';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import type * as BootstrapAppModule from '~/bootstrap/app.module';
import { createTestDatabase, dropTestDatabase, type TestDatabaseContext } from '../support/test-postgres';

jest.setTimeout(120_000);

import { API_GLOBAL_PREFIX } from '~/platform/http/api-global-prefix';

const API_PREFIX = `/${API_GLOBAL_PREFIX}`;
const SAFE_INTEGER_BOUNDARY_PUBLIC_ID = '9007199254740993';
const GENERATION_HEADER = { [CATEGORY_IDENTITY_GENERATION_HEADER]: CATEGORY_IDENTITY_CONTRACT_VERSION };

const storageStub = { getPublicUrl: () => '' } as unknown as StorageService;

describe('category public identity cutover (integration)', () => {
  let testDb: TestDatabaseContext;
  let app: INestApplication<App>;
  let entityManager: EntityManager;
  let storageRoot: string;

  beforeAll(async () => {
    testDb = await createTestDatabase('category_cutover_int', { fresh: true });
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-category-cutover-int-'));

    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = testDb.rootConfig.host;
    process.env.DB_PORT = String(testDb.rootConfig.port);
    process.env.DB_USER = testDb.rootConfig.user;
    process.env.DB_PASSWORD = testDb.rootConfig.password;
    process.env.DB_NAME = testDb.dbName;
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.BCRYPT_SALT_ROUNDS = '4';
    process.env.CACHE_DRIVER = 'memory';
    process.env.RATE_LIMIT_DRIVER = 'memory';
    process.env.QUEUE_DRIVER = 'inline';
    process.env.MAIL_DRIVER = 'logger';
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_ROOT = storageRoot;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('~/bootstrap/app.module') as typeof BootstrapAppModule;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(new LocalFileStorageService({ driver: 'local', localRoot: storageRoot }))
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    app.useGlobalInterceptors(new CategoryIdentityGenerationInterceptor());
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
    entityManager = app.get(EntityManager);
  });

  afterAll(async () => {
    await app?.close();
    if (storageRoot) {
      await rm(storageRoot, { recursive: true, force: true });
    }
    if (testDb) {
      await dropTestDatabase(testDb);
    }
  });

  function buildCommandRepository() {
    return new MikroOrmCategoryCommandRepository(entityManager, storageStub);
  }

  function buildQueryRepository() {
    return new MikroOrmCategoryQueryRepository(entityManager, storageStub);
  }

  // Combined public read + command surface backed by the real database.
  function buildCategoryRepository(): CategoryRepository {
    return {
      findByPublicId: (publicId: string) => buildQueryRepository().findByPublicId(publicId),
      create: (input) => buildCommandRepository().create(input),
    } as unknown as CategoryRepository;
  }

  const inventoryStockPoolStub = {
    openSellerPool: async () => undefined,
  } as never;

  async function setNextPublicId(value: string) {
    await entityManager.getConnection().execute(
      'select setval(\'category_public_id_seq\', ?, false)',
      [value],
    );
  }

  it('advertises the category identity contract version', async () => {
    const response = await request(app.getHttpServer()).get(`${API_PREFIX}/categories/contract`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ version: '2' });
  });

  it('rejects category-bearing requests whose generation is missing or stale', async () => {
    const missing = await request(app.getHttpServer()).get(`${API_PREFIX}/categories`);
    expect(missing.status).toBe(409);
    expect(missing.body.code ?? missing.body.message?.code).toBe('CATEGORY_IDENTITY_GENERATION_MISMATCH');

    const stale = await request(app.getHttpServer())
      .get(`${API_PREFIX}/categories`)
      .set({ [CATEGORY_IDENTITY_GENERATION_HEADER]: '1' });
    expect(stale.status).toBe(409);

    const current = await request(app.getHttpServer())
      .get(`${API_PREFIX}/categories`)
      .set(GENERATION_HEADER);
    expect(current.status).toBe(200);

    // The probe stays exempt so an outdated client can discover the generation.
    const probe = await request(app.getHttpServer()).get(`${API_PREFIX}/categories/contract`);
    expect(probe.status).toBe(200);
  });

  it('does not gate the product inventory SSE stream', async () => {
    // Native EventSource cannot send the generation header; the stream carries no
    // category identity, so it must never be rejected with the generation error.
    const response = await request(app.getHttpServer())
      .get(`${API_PREFIX}/products/does-not-exist/inventory/events`)
      .timeout({ response: 5_000, deadline: 6_000 });

    expect(response.status).not.toBe(409);
  });

  it('serializes public identities as lossless decimal strings beyond the safe integer range', async () => {
    await setNextPublicId(SAFE_INTEGER_BOUNDARY_PUBLIC_ID);
    const created = await buildCommandRepository().create({ name: 'Large Id', rank: 1 });

    expect(created.publicId).toBe(SAFE_INTEGER_BOUNDARY_PUBLIC_ID);

    const response = await request(app.getHttpServer())
      .get(`${API_PREFIX}/categories`)
      .set(GENERATION_HEADER);

    expect(response.status).toBe(200);
    const serialized = response.body as Array<{ id: string; name: string }>;
    const large = serialized.find((category) => category.name === 'Large Id');
    expect(large?.id).toBe(SAFE_INTEGER_BOUNDARY_PUBLIC_ID);
    expect(typeof large?.id).toBe('string');
    // A JavaScript Number round-trip would collapse 2^53 + 1 to 2^53.
    expect(JSON.stringify(serialized)).toContain(`"id":"${SAFE_INTEGER_BOUNDARY_PUBLIC_ID}"`);
  });

  it('resolves public identities to internal relationships without internal-id fallback', async () => {
    await setNextPublicId('42');
    const first = await buildCommandRepository().create({ name: 'Collision Target', rank: 1 });
    const second = await buildCommandRepository().create({ name: 'Second Target', rank: 2 });

    const query = buildQueryRepository();

    // Two distinct public identities resolve to their own categories.
    const resolvedFirst = await query.findByPublicId(first.publicId);
    const resolvedSecond = await query.findByPublicId(second.publicId);
    expect(resolvedFirst?.id).toBe(first.id);
    expect(resolvedSecond?.id).toBe(second.id);
    expect(resolvedFirst?.id).not.toBe(resolvedSecond?.id);

    // Internal category identities are UUIDs, so a numeric public/internal
    // collision cannot be seeded in this schema. The no-fallback guarantee is
    // therefore proven by rejecting internal UUIDs outright: they must never be
    // reinterpreted as public identity.
    expect(await query.findByPublicId(first.id)).toBeNull();
    expect(await query.findByPublicId(second.id)).toBeNull();
    expect(await query.findByPublicId('not-a-public-id')).toBeNull();

    const attributesByPublicId = await request(app.getHttpServer())
      .get(`${API_PREFIX}/categories/${first.publicId}/attributes`)
      .set(GENERATION_HEADER);
    expect(attributesByPublicId.status).toBe(200);

    // An internal UUID cannot reach category attributes; only public identity does.
    const attributesByInternalId = await request(app.getHttpServer())
      .get(`${API_PREFIX}/categories/${first.id}/attributes`)
      .set(GENERATION_HEADER);
    expect(attributesByInternalId.status).toBe(404);
  });

  it('keeps requests and responses on public identity across category endpoints', async () => {
    const parent = await buildCommandRepository().create({ name: 'Root Cutover', rank: 1 });
    const createCategoryUseCase = new CreateCategoryUseCase(buildCategoryRepository());
    const childResult = await createCategoryUseCase.execute({
      parentId: parent.publicId,
      name: 'Child Cutover',
      rank: 1,
    });
    expect(childResult.isOk).toBe(true);
    if (!childResult.isOk) return;
    const child = childResult.value;
    expect(child.parentPublicId).toBe(parent.publicId);

    const children = await request(app.getHttpServer())
      .get(`${API_PREFIX}/categories`)
      .set(GENERATION_HEADER)
      .query({ parent_id: parent.publicId });
    expect(children.status).toBe(200);
    expect(children.body).toEqual([
      expect.objectContaining({ id: child.publicId, parent_id: parent.publicId, name: 'Child Cutover' }),
    ]);

    // Legacy internal-id semantics are rejected, never silently reinterpreted.
    const legacyParentQuery = await request(app.getHttpServer())
      .get(`${API_PREFIX}/categories`)
      .set(GENERATION_HEADER)
      .query({ parent_id: parent.id });
    expect(legacyParentQuery.status).toBe(400);
  });

  it('assigns the internal category relationship when a seller submits a public category id', async () => {
    const em = entityManager.fork();
    const user = em.create(UserEntity, {
      email: `cutover-${randomUUID()}@example.com`,
    });
    const shop = em.create(ShopEntity, {
      ownerUser: user,
      shopName: `Cutover Shop ${randomUUID().slice(0, 8)}`,
      slug: `cutover-shop-${randomUUID().slice(0, 8)}`,
      currency: 'USD',
    });
    await em.persistAndFlush([user, shop]);

    const category = await buildCommandRepository().create({ name: 'Assignable', rank: 1 });
    const sellerProductQueryRepository = new MikroOrmSellerProductQueryRepository(entityManager, storageStub);
    const productCommandRepository = new MikroOrmProductCommandRepository(
      entityManager,
      storageStub,
      {} as never,
      inventoryStockPoolStub,
    );
    const useCase = new CreateProductDraftUseCase(
      { findById: async () => shop } as never,
      buildCategoryRepository(),
      sellerProductQueryRepository,
      productCommandRepository,
    );

    const result = await useCase.execute(
      {
        userId: user.id,
        email: user.email,
        status: UserStatus.ACTIVE,
        sessionId: randomUUID(),
        roles: ['admin'],
        permissions: [],
      },
      {
        shopId: shop.id,
        categoryId: category.publicId,
        title: 'Public Identity Draft',
        description: 'A draft assigned through public identity.',
        whoMade: ProductWhoMade.I_DID,
      },
    );

    expect(result.isOk).toBe(true);
    if (!result.isOk) return;

    expect(result.value.categoryPublicId).toBe(category.publicId);

    const stored = await entityManager.getConnection().execute<Array<{ category_id: string | null }>>(
      'select category_id from products where id = ?',
      [result.value.id],
    );
    expect(stored).toEqual([{ category_id: category.id }]);
    expect(stored[0].category_id).not.toBe(category.publicId);
  });

  it('never falls back to internal identity when assigning a product category', async () => {
    const em = entityManager.fork();
    const user = em.create(UserEntity, {
      email: `cutover-miss-${randomUUID()}@example.com`,
    });
    const shop = em.create(ShopEntity, {
      ownerUser: user,
      shopName: `Cutover Miss ${randomUUID().slice(0, 8)}`,
      slug: `cutover-miss-${randomUUID().slice(0, 8)}`,
      currency: 'USD',
    });
    await em.persistAndFlush([user, shop]);

    const category = await buildCommandRepository().create({ name: 'No Fallback', rank: 1 });
    const sellerProductQueryRepository = new MikroOrmSellerProductQueryRepository(entityManager, storageStub);
    const productCommandRepository = new MikroOrmProductCommandRepository(
      entityManager,
      storageStub,
      {} as never,
      inventoryStockPoolStub,
    );
    const useCase = new CreateProductDraftUseCase(
      { findById: async () => shop } as never,
      buildCategoryRepository(),
      sellerProductQueryRepository,
      productCommandRepository,
    );

    const actor = {
      userId: user.id,
      email: user.email,
      status: UserStatus.ACTIVE,
      sessionId: randomUUID(),
      roles: ['admin'],
      permissions: [],
    };

    const byInternalId = await useCase.execute(actor, {
      shopId: shop.id,
      categoryId: category.id,
      title: 'Should Fail',
      description: 'Internal ids must not resolve through the public path.',
      whoMade: ProductWhoMade.I_DID,
    });
    expect(byInternalId.isOk).toBe(false);

    const before = await entityManager.getConnection().execute<Array<{ count: string }>>(
      'select count(*)::text as count from products where shop_id = ?',
      [shop.id],
    );
    expect(before).toEqual([{ count: '0' }]);
  });

  it('filters seller product lists by the internal relationship behind a public category id', async () => {
    const em = entityManager.fork();
    const user = em.create(UserEntity, {
      email: `cutover-filter-${randomUUID()}@example.com`,
    });
    const shop = em.create(ShopEntity, {
      ownerUser: user,
      shopName: `Cutover Filter ${randomUUID().slice(0, 8)}`,
      slug: `cutover-filter-${randomUUID().slice(0, 8)}`,
      currency: 'USD',
    });
    await em.persistAndFlush([user, shop]);

    const category = await buildCommandRepository().create({ name: 'Filterable', rank: 1 });
    const sellerProductQueryRepository = new MikroOrmSellerProductQueryRepository(entityManager, storageStub);
    const productCommandRepository = new MikroOrmProductCommandRepository(
      entityManager,
      storageStub,
      {} as never,
      inventoryStockPoolStub,
    );
    const createUseCase = new CreateProductDraftUseCase(
      { findById: async () => shop } as never,
      buildCategoryRepository(),
      sellerProductQueryRepository,
      productCommandRepository,
    );

    const created = await createUseCase.execute(
      {
        userId: user.id,
        email: user.email,
        status: UserStatus.ACTIVE,
        sessionId: randomUUID(),
        roles: ['admin'],
        permissions: [],
      },
      {
        shopId: shop.id,
        categoryId: category.publicId,
        title: 'Filterable Draft',
        description: 'A draft used to prove list filtering by public identity.',
        whoMade: ProductWhoMade.I_DID,
      },
    );
    expect(created.isOk).toBe(true);

    const listUseCase = new ListShopProductsUseCase(
      sellerProductQueryRepository,
      buildCategoryRepository(),
    );

    const byPublicId = await listUseCase.execute({
      shopId: shop.id,
      page: 1,
      limit: 20,
      categoryId: category.publicId,
    });
    expect(byPublicId.items).toHaveLength(1);
    expect(byPublicId.items[0]?.state).toBe(ProductState.DRAFT);
    expect(byPublicId.items[0]?.categoryPublicId).toBe(category.publicId);

    const byInternalId = await listUseCase.execute({
      shopId: shop.id,
      page: 1,
      limit: 20,
      categoryId: category.id,
    });
    expect(byInternalId.items).toHaveLength(0);
    expect(byInternalId.meta.total).toBe(0);
  });
});
