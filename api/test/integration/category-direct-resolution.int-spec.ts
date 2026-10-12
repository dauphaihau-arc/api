import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { validationExceptionFactory } from '~/platform/pipes/validation-exception.factory';
import { API_GLOBAL_PREFIX } from '~/platform/http/api-global-prefix';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { LocalFileStorageService } from '~/integrations/storage/infra/local-file-storage.service';
import { CategoryIdentityGenerationInterceptor } from '~/domains/category/api/rest/category-identity-generation.interceptor';
import { CATEGORY_IDENTITY_CONTRACT_VERSION } from '~/domains/category/app/category-identity-contract';
import { CreateCategoryUseCase } from '~/domains/category/app/use-cases/create-category/create-category.use-case';
import type { CategoryRepository } from '~/domains/category/app/ports/category.repository';
import { MikroOrmCategoryCommandRepository } from '~/domains/category/infra/mikro-orm-category-command.repository';
import { MikroOrmCategoryQueryRepository } from '~/domains/category/infra/mikro-orm-category-query.repository';
import type * as BootstrapAppModule from '~/bootstrap/app.module';
import { createTestDatabase, dropTestDatabase, type TestDatabaseContext } from '../support/test-postgres';

jest.setTimeout(120_000);

const API_PREFIX = `/${API_GLOBAL_PREFIX}`;
const SAFE_INTEGER_BOUNDARY_PUBLIC_ID = '9007199254740993';
const GENERATION_HEADER = {
  'x-category-identity-generation': CATEGORY_IDENTITY_CONTRACT_VERSION,
};

const storageStub = { getPublicUrl: () => '' } as unknown as StorageService;

/**
 * Real-persistence proof for authoritative category resolution: the actual
 * repository reads PostgreSQL to return the current slug and ordered
 * root-to-current ancestry, and the HTTP boundary surfaces it under the
 * generation gate. Controller mocks cannot prove ordered ancestry or the
 * bigint-range rejection, so this exercises the real database.
 */
describe('category direct resolution (integration)', () => {
  let testDb: TestDatabaseContext;
  let app: INestApplication<App>;
  let entityManager: EntityManager;
  let storageRoot: string;

  beforeAll(async () => {
    testDb = await createTestDatabase('category_resolution_int', { fresh: true });
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-category-resolution-int-'));

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

  function buildCreateCategoryUseCase() {
    const categoryRepository = {
      findByPublicId: (publicId: string) => buildQueryRepository().findByPublicId(publicId),
      create: (input: Parameters<CategoryRepository['create']>[0]) =>
        buildCommandRepository().create(input),
    } as unknown as CategoryRepository;

    return new CreateCategoryUseCase(categoryRepository);
  }

  async function setNextPublicId(value: string) {
    await entityManager.getConnection().execute(
      'select setval(\'category_public_id_seq\', ?, false)',
      [value],
    );
  }

  it('resolves the current slug and ordered root-to-current ancestry from persistence', async () => {
    const root = await buildCommandRepository().create({ name: 'Home & Garden', rank: 1 });
    const createCategory = buildCreateCategoryUseCase();
    const childResult = await createCategory.execute({
      parentId: root.publicId,
      name: 'Kitchen',
      rank: 1,
    });
    expect(childResult.isOk).toBe(true);
    if (!childResult.isOk) return;

    const leafResult = await createCategory.execute({
      parentId: childResult.value.publicId,
      name: 'Ceramic Mugs',
      rank: 1,
    });
    expect(leafResult.isOk).toBe(true);
    if (!leafResult.isOk) return;
    const leaf = leafResult.value;

    // Real repository lookup: ordered ancestry, self included, public-only ids.
    const resolution = await buildQueryRepository().resolveByPublicId(leaf.publicId);
    expect(resolution).toEqual({
      category: {
        id: leaf.publicId,
        slug: 'ceramic-mugs',
        name: 'Ceramic Mugs',
        featuredFacetKeys: undefined,
      },
      ancestry: [
        { id: root.publicId, slug: 'home-garden', name: 'Home & Garden' },
        { id: childResult.value.publicId, slug: 'kitchen', name: 'Kitchen' },
        { id: leaf.publicId, slug: 'ceramic-mugs', name: 'Ceramic Mugs' },
      ],
    });

    // HTTP boundary returns the same resolution with a canonical flat path.
    const response = await request(app.getHttpServer())
      .get(`${API_PREFIX}/categories/${leaf.publicId}`)
      .set(GENERATION_HEADER)
      .expect(200);

    expect(response.body).toEqual({
      category: { id: leaf.publicId, slug: 'ceramic-mugs', name: 'Ceramic Mugs' },
      ancestry: [
        { id: root.publicId, slug: 'home-garden', name: 'Home & Garden' },
        { id: childResult.value.publicId, slug: 'kitchen', name: 'Kitchen' },
        { id: leaf.publicId, slug: 'ceramic-mugs', name: 'Ceramic Mugs' },
      ],
      canonical_path: `/c/ceramic-mugs-c${leaf.publicId}`,
    });
    // No internal UUID leaks through ancestry or the canonical path.
    expect(JSON.stringify(response.body)).not.toContain(leaf.id);

    const list = await request(app.getHttpServer())
      .get(`${API_PREFIX}/categories`)
      .set(GENERATION_HEADER)
      .expect(200);
    expect(list.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: root.publicId, slug: 'home-garden' }),
      ]),
    );
  });

  it('keeps decimal identities lossless in resolution past the safe integer range', async () => {
    await setNextPublicId(SAFE_INTEGER_BOUNDARY_PUBLIC_ID);
    const category = await buildCommandRepository().create({ name: 'Large Resolution', rank: 9 });

    const response = await request(app.getHttpServer())
      .get(`${API_PREFIX}/categories/${SAFE_INTEGER_BOUNDARY_PUBLIC_ID}`)
      .set(GENERATION_HEADER)
      .expect(200);

    expect(response.body.category.id).toBe(SAFE_INTEGER_BOUNDARY_PUBLIC_ID);
    expect(typeof response.body.category.id).toBe('string');
    expect(response.body.ancestry).toEqual([
      { id: SAFE_INTEGER_BOUNDARY_PUBLIC_ID, slug: category.slug, name: 'Large Resolution' },
    ]);
    expect(JSON.stringify(response.body)).toContain(`"id":"${SAFE_INTEGER_BOUNDARY_PUBLIC_ID}"`);
  });

  it('returns 404 for unknown, malformed, and out-of-bigint-range identities without a DB error', async () => {
    const root = await buildCommandRepository().create({ name: 'Known Root', rank: 1 });
    const unknownPublicId = (BigInt(root.publicId) + 1_000_000n).toString();

    const unknown = await request(app.getHttpServer())
      .get(`${API_PREFIX}/categories/${unknownPublicId}`)
      .set(GENERATION_HEADER);
    expect(unknown.status).toBe(404);

    for (const malformed of [root.id, '0', '01', '-1', 'internal-uuid']) {
      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/categories/${malformed}`)
        .set(GENERATION_HEADER);
      expect(response.status).toBe(404);
    }

    // Beyond PostgreSQL bigint range: absent, never a database error.
    for (const outOfRange of ['9223372036854775808', '999999999999999999999999999']) {
      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/categories/${outOfRange}`)
        .set(GENERATION_HEADER);
      expect(response.status).toBe(404);
    }
  });
});
