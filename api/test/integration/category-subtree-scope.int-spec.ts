import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { MongoClient } from 'mongodb';
import request from 'supertest';
import type { App } from 'supertest/types';
import { validationExceptionFactory } from '~/platform/pipes/validation-exception.factory';
import { API_GLOBAL_PREFIX } from '~/platform/http/api-global-prefix';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { LocalFileStorageService } from '~/integrations/storage/infra/local-file-storage.service';
import {
  CATEGORY_IDENTITY_GENERATION_HEADER,
  CategoryIdentityGenerationInterceptor,
} from '~/domains/category/api/rest/category-identity-generation.interceptor';
import { CATEGORY_IDENTITY_CONTRACT_VERSION } from '~/domains/category/app/category-identity-contract';
import { CreateCategoryUseCase } from '~/domains/category/app/use-cases/create-category/create-category.use-case';
import type { CategoryRepository } from '~/domains/category/app/ports/category.repository';
import type { CategorySummary } from '~/domains/category/app/category.types';
import { MikroOrmCategoryCommandRepository } from '~/domains/category/infra/mikro-orm-category-command.repository';
import { MikroOrmCategoryQueryRepository } from '~/domains/category/infra/mikro-orm-category-query.repository';
import { CatalogSearchDocumentRepository } from '~/domains/product/app/ports/catalog-search-document.repository';
import { CatalogMongoAccess } from '~/domains/product/infra/catalog/mongo/access/catalog-mongo.access';
import type { CatalogSearchDocument } from '~/domains/product/infra/catalog/mongo/documents/catalog-search-document.mapper';
import { ProductState } from '~/domains/product/domain/enums/product-state.enum';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';
import type * as BootstrapAppModule from '~/bootstrap/app.module';
import { createTestDatabase, dropTestDatabase, type TestDatabaseContext } from '../support/test-postgres';

jest.setTimeout(120_000);

const API_PREFIX = `/${API_GLOBAL_PREFIX}`;
const GENERATION_HEADER = {
  [CATEGORY_IDENTITY_GENERATION_HEADER]: CATEGORY_IDENTITY_CONTRACT_VERSION,
};

interface PublicProductFacetResponse {
  facet_key: string;
  attribute_name: string;
  options: Array<{ option_key: string; value: string }>;
}

interface PublicFacetsResponse {
  facets: PublicProductFacetResponse[];
}

interface SeededProductAttribute {
  key: string;
  name: string;
  optionValue: string;
  id?: string;
}

const storageStub = { getPublicUrl: () => '' } as unknown as StorageService;

/**
 * Real-persistence proof for descendant category scope at the public HTTP
 * boundary. The listing and facet endpoints resolve a category public identity
 * to its current descendant subtree through PostgreSQL and then query the
 * projected catalog read model; a controller or use-case mock cannot prove that
 * both endpoints share the same descendant scope over the seeded hierarchy.
 */
describe('category subtree listing and facets (integration)', () => {
  let testDb: TestDatabaseContext;
  let app: INestApplication<App>;
  let entityManager: EntityManager;
  let storageRoot: string;
  let mongoDbName: string;
  let mongoClient: MongoClient;

  beforeAll(async () => {
    testDb = await createTestDatabase('category_subtree_int', { fresh: true });
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-category-subtree-int-'));
    mongoDbName = `arc_subtree_int_${randomUUID().replace(/-/g, '')}`;

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
    process.env.CACHE_ENABLED = 'true';
    process.env.CATEGORY_TAXONOMY_CACHE_ENABLED = 'true';
    process.env.RATE_LIMIT_DRIVER = 'memory';
    process.env.QUEUE_DRIVER = 'inline';
    process.env.MAIL_DRIVER = 'logger';
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_ROOT = storageRoot;
    process.env.CATALOG_SEARCH_DRIVER = 'mongo-basic';
    process.env.CATALOG_MONGODB_URI = process.env.CATALOG_MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
    process.env.CATALOG_MONGODB_DB_NAME = mongoDbName;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('~/bootstrap/app.module') as typeof BootstrapAppModule;

    // The production CatalogMongoAccess loads the driver through a dynamic
    // `import()`, which jest's VM context cannot service. Inject a real Mongo
    // client built with a static import so the catalog read model is the real
    // projected collection, not a stub.
    mongoClient = new MongoClient(process.env.CATALOG_MONGODB_URI);
    await mongoClient.connect();
    const mongoDatabase = mongoClient.db(mongoDbName);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(new LocalFileStorageService({ driver: 'local', localRoot: storageRoot }))
      .overrideProvider(CatalogMongoAccess)
      .useValue({
        ping: async () => undefined,
        getCollection: async (name: string) => mongoDatabase.collection(name),
        onApplicationShutdown: async () => undefined,
      })
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
    if (mongoClient) {
      await mongoClient.db(mongoDbName).dropDatabase();
      await mongoClient.close();
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

  async function createRoot(name: string): Promise<CategorySummary> {
    return buildCommandRepository().create({ name, rank: 1 });
  }

  async function createChild(
    parent: CategorySummary,
    name: string,
  ): Promise<CategorySummary> {
    const result = await buildCreateCategoryUseCase().execute({
      parentId: parent.publicId,
      name,
      rank: 1,
    });
    if (!result.isOk) {
      throw new Error(`failed to create child category: ${JSON.stringify(result.error)}`);
    }
    return result.value;
  }

  function buildSearchDocument(input: {
    productId: string;
    category: CategorySummary;
    title: string;
    attribute?: SeededProductAttribute;
    attributes?: SeededProductAttribute[];
  }): CatalogSearchDocument {
    const attributes: SeededProductAttribute[] = input.attributes ??
      (input.attribute ? [input.attribute] : []);

    return {
      _id: input.productId,
      productId: input.productId,
      productPublicId: input.productId,
      shopId: 'shop-subtree-1',
      shopPublicId: 'shop-subtree-public-1',
      shopSlug: 'arc-subtree-supplies',
      shopName: 'Arc Subtree Supplies',
      slug: input.productId,
      title: input.title,
      description: `${input.title} description`,
      state: ProductState.ACTIVE,
      categoryId: input.category.id,
      categoryPublicId: input.category.publicId,
      isDigital: false,
      whoMade: ProductWhoMade.I_DID,
      attributes: attributes.map((attribute) => ({
        categoryAttributeId: attribute.id ?? attribute.key,
        categoryAttributeKey: attribute.key,
        categoryAttributeName: attribute.name,
        selectedOptionId: `${attribute.key}-${attribute.optionValue}`,
        selectedOptionKey: attribute.optionValue.toLowerCase(),
        selectedOptionValue: attribute.optionValue,
      })),
      inferredFacets: [],
      suggest: [input.title.toLowerCase()],
      keywords: [input.title.toLowerCase()],
      variantCount: 1,
      price: { minAmountMinor: 1000, maxAmountMinor: 1000, currency: 'USD' },
      inventory: { inStock: true, totalStock: 5 },
      media: {},
      ranking: { popularityScore: 0, createdAt: new Date('2026-01-01T00:00:00.000Z') },
      flags: { hasImages: true },
      sourceVersion: 1,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
  }

  async function seedProducts(documents: CatalogSearchDocument[]) {
    const repository = app.get(CatalogSearchDocumentRepository);
    for (const document of documents) {
      await repository.upsert(document);
    }
  }

  async function listProducts(categoryPublicId: string) {
    const response = await request(app.getHttpServer())
      .get(`${API_PREFIX}/products`)
      .set(GENERATION_HEADER)
      .query({ category_id: categoryPublicId });
    expect(response.status).toBe(200);
    return response.body as {
      items: Array<{ id: string }>;
      meta: { total: number };
    };
  }

  async function listFacets(
    categoryPublicId: string,
    extraQuery: Record<string, string | number> = {},
  ): Promise<PublicFacetsResponse> {
    const response = await request(app.getHttpServer())
      .get(`${API_PREFIX}/products/facets`)
      .set(GENERATION_HEADER)
      .query({ category_id: categoryPublicId, ...extraQuery });
    expect(response.status).toBe(200);
    return response.body as PublicFacetsResponse;
  }

  async function resolveCategory(categoryPublicId: string) {
    const response = await request(app.getHttpServer())
      .get(`${API_PREFIX}/categories/${categoryPublicId}`)
      .set(GENERATION_HEADER);
    expect(response.status).toBe(200);
    return response.body as {
      category: { id: string; slug: string; name: string };
      ancestry: Array<{ id: string; slug: string; name: string }>;
      canonical_path: string;
    };
  }

  it('lists every eligible product in the descendant subtree exactly once', async () => {
    const root = await createRoot('Subtree Root');
    const child = await createChild(root, 'Subtree Child');
    const grandchild = await createChild(child, 'Subtree Grandchild');
    const unrelated = await createRoot('Unrelated Root');

    await seedProducts([
      buildSearchDocument({ productId: 'product-child', category: child, title: 'Child Product' }),
      buildSearchDocument({ productId: 'product-grandchild', category: grandchild, title: 'Grandchild Product' }),
      buildSearchDocument({ productId: 'product-unrelated', category: unrelated, title: 'Unrelated Product' }),
    ]);

    const rootList = await listProducts(root.publicId);
    const rootIds = rootList.items.map((item) => item.id).sort();
    // Each product sits in exactly one category, so the subtree query returns it
    // once; the literal two-element list fails if any product is duplicated.
    expect(rootIds).toEqual(['product-child', 'product-grandchild']);
    expect(rootList.meta.total).toBe(2);

    const childList = await listProducts(child.publicId);
    expect(childList.items.map((item) => item.id).sort()).toEqual([
      'product-child',
      'product-grandchild',
    ]);

    const grandchildList = await listProducts(grandchild.publicId);
    expect(grandchildList.items.map((item) => item.id)).toEqual(['product-grandchild']);
  });

  it('scopes facets and listing to the descendant subtree of a static hierarchy', async () => {
    const root = await createRoot('Static Subtree Root');
    const child = await createChild(root, 'Static Subtree Child');
    const grandchild = await createChild(child, 'Static Subtree Grandchild');
    const sibling = await createRoot('Static Sibling Root');

    await buildCommandRepository().createAttribute({
      categoryId: child.id,
      key: 'brand',
      name: 'Brand',
      options: [{ value: 'Aurora', rank: 1 }],
    });
    await buildCommandRepository().createAttribute({
      categoryId: grandchild.id,
      key: 'color',
      name: 'Color',
      options: [{ value: 'Blue', rank: 1 }],
    });
    await buildCommandRepository().createAttribute({
      categoryId: sibling.id,
      key: 'material',
      name: 'Material',
      options: [{ value: 'Steel', rank: 1 }],
    });

    await seedProducts([
      buildSearchDocument({
        productId: 'product-facet-child',
        category: child,
        title: 'Child Product',
        attribute: { key: 'brand', name: 'Brand', optionValue: 'Aurora' },
      }),
      buildSearchDocument({
        productId: 'product-facet-grandchild',
        category: grandchild,
        title: 'Grandchild Product',
        attribute: { key: 'color', name: 'Color', optionValue: 'Blue' },
      }),
      buildSearchDocument({
        productId: 'product-sibling',
        category: sibling,
        title: 'Sibling Product',
        attribute: { key: 'material', name: 'Material', optionValue: 'Steel' },
      }),
    ]);

    // The root listing and its facets cover the same descendant subtree.
    const rootList = await listProducts(root.publicId);
    expect(rootList.items.map((item) => item.id).sort()).toEqual([
      'product-facet-child',
      'product-facet-grandchild',
    ]);

    // First public facet read warms the taxonomy-subtree cache. The repeated
    // same-category public HTTP read must observe the same descendant scope and
    // return the same literal facets/options from the warmed cache.
    const firstRootFacets = await listFacets(root.publicId);
    const warmedRootFacets = await listFacets(root.publicId);
    expect(warmedRootFacets.facets).toEqual(firstRootFacets.facets);
    expect(warmedRootFacets.facets).toEqual([
      {
        facet_key: 'brand',
        attribute_name: 'Brand',
        options: [{ option_key: 'aurora', value: 'Aurora' }],
      },
      {
        facet_key: 'color',
        attribute_name: 'Color',
        options: [{ option_key: 'blue', value: 'Blue' }],
      },
    ]);

    // The listing scope is unchanged by the warmed facet reads: still the same
    // fixed descendant subtree, not the sibling branch.
    const rootListAfterWarm = await listProducts(root.publicId);
    expect(rootListAfterWarm.items.map((item) => item.id).sort()).toEqual([
      'product-facet-child',
      'product-facet-grandchild',
    ]);

    // A mid-tree category sees its own subtree, not the sibling branch.
    expect(
      (await listFacets(child.publicId)).facets.map((facet) => facet.facet_key).sort(),
    ).toEqual(['brand', 'color']);

    // The sibling root is excluded from both the listing and the facets.
    const siblingList = await listProducts(sibling.publicId);
    expect(siblingList.items.map((item) => item.id)).toEqual(['product-sibling']);
    expect(
      (await listFacets(sibling.publicId)).facets.map((facet) => facet.facet_key),
    ).toEqual(['material']);
  });

  it('returns 200 with empty products and facets for a category with no eligible products', async () => {
    const empty = await createRoot('Empty Accessible Category');

    const listing = await listProducts(empty.publicId);
    expect(listing.items).toEqual([]);
    expect(listing.meta.total).toBe(0);

    const facets = await listFacets(empty.publicId);
    expect(facets.facets).toEqual([]);

    const resolution = await resolveCategory(empty.publicId);
    expect(resolution.category.id).toBe(empty.publicId);
  });

  function facetOptionKeys(body: PublicFacetsResponse): Record<string, string[]> {
    return Object.fromEntries(
      body.facets.map((facet) => [
        facet.facet_key,
        facet.options.map((option) => option.option_key),
      ]),
    );
  }

  it('honors active filters in facet alternatives except the facet own filter', async () => {
    const root = await createRoot('Facet Filter Root');

    await seedProducts([
      buildSearchDocument({
        productId: 'product-filter-black-cotton',
        category: root,
        title: 'Black Cotton Product',
        attributes: [
          { key: 'color', name: 'Color', optionValue: 'Black' },
          { key: 'material', name: 'Material', optionValue: 'Cotton' },
        ],
      }),
      buildSearchDocument({
        productId: 'product-filter-white-linen',
        category: root,
        title: 'White Linen Product',
        attributes: [
          { key: 'color', name: 'Color', optionValue: 'White' },
          { key: 'material', name: 'Material', optionValue: 'Linen' },
        ],
      }),
    ]);

    expect(facetOptionKeys(await listFacets(root.publicId))).toEqual({
      color: ['black', 'white'],
      material: ['cotton', 'linen'],
    });

    // Selecting Color=Black keeps every Color alternative (own filter excluded)
    // while Material is narrowed to the products that match the Color filter.
    expect(facetOptionKeys(await listFacets(root.publicId, { attr_color: 'black' }))).toEqual({
      color: ['black', 'white'],
      material: ['cotton'],
    });

    // The symmetric case: Material=White keeps Material alternatives and
    // narrows Color to the products that match the Material filter.
    expect(facetOptionKeys(await listFacets(root.publicId, { attr_material: 'linen' }))).toEqual({
      color: ['white'],
      material: ['cotton', 'linen'],
    });
  });

  it('does not let pagination or sorting change facet alternatives', async () => {
    const root = await createRoot('Facet Paging Root');

    await seedProducts([
      buildSearchDocument({
        productId: 'product-paging-1',
        category: root,
        title: 'Paging One',
        attributes: [{ key: 'color', name: 'Color', optionValue: 'Black' }],
      }),
      buildSearchDocument({
        productId: 'product-paging-2',
        category: root,
        title: 'Paging Two',
        attributes: [{ key: 'color', name: 'Color', optionValue: 'White' }],
      }),
    ]);

    const baseline = await listFacets(root.publicId);
    const paged = await listFacets(root.publicId, { page: 2, limit: 1, order: 'price_desc' });

    expect(paged.facets).toEqual(baseline.facets);
  });

  it('merges by stable key and keeps same-label attributes distinct', async () => {
    const root = await createRoot('Facet Identity Root');

    await seedProducts([
      buildSearchDocument({
        productId: 'product-identity-1',
        category: root,
        title: 'Identity One',
        attributes: [
          {
            id: 'identity-color', key: 'color', name: 'Color', optionValue: 'Black', 
          },
          {
            id: 'identity-colour', key: 'colour', name: 'Color', optionValue: 'White', 
          },
          {
            id: 'identity-material-fabric', key: 'material', name: 'Fabric', optionValue: 'Cotton', 
          },
        ],
      }),
      buildSearchDocument({
        productId: 'product-identity-2',
        category: root,
        title: 'Identity Two',
        attributes: [
          {
            id: 'identity-material-textile', key: 'material', name: 'Material', optionValue: 'Linen', 
          },
        ],
      }),
    ]);

    const facets = (await listFacets(root.publicId)).facets;

    // Distinct stable keys that share the "Color" label stay separate facets.
    expect(facets.map((facet) => facet.facet_key).sort()).toEqual(['color', 'colour', 'material']);
    expect(facets.find((facet) => facet.facet_key === 'color')?.attribute_name).toBe('Color');
    expect(facets.find((facet) => facet.facet_key === 'colour')?.attribute_name).toBe('Color');

    // One stable key contributed by two attribute identities resolves its label
    // deterministically and unions both identities' options.
    expect(facets.find((facet) => facet.facet_key === 'material')).toEqual({
      facet_key: 'material',
      attribute_name: 'Fabric',
      options: [
        { option_key: 'cotton', value: 'Cotton' },
        { option_key: 'linen', value: 'Linen' },
      ],
    });
  });

  it('exposes filter-aware alternatives for configured taxonomy facets', async () => {
    const root = await createRoot('Facet Taxonomy Root');

    await buildCommandRepository().createAttribute({
      categoryId: root.id,
      key: 'color',
      name: 'Color',
      options: [
        { value: 'Black', rank: 1 },
        { value: 'White', rank: 2 },
        { value: 'Red', rank: 3 },
      ],
    });
    await buildCommandRepository().createAttribute({
      categoryId: root.id,
      key: 'material',
      name: 'Material',
      options: [
        { value: 'Cotton', rank: 1 },
        { value: 'Linen', rank: 2 },
        { value: 'Silk', rank: 3 },
      ],
    });

    await seedProducts([
      buildSearchDocument({
        productId: 'product-taxonomy-black-cotton',
        category: root,
        title: 'Taxonomy Black Cotton',
        attributes: [
          { key: 'color', name: 'Color', optionValue: 'Black' },
          { key: 'material', name: 'Material', optionValue: 'Cotton' },
        ],
      }),
      buildSearchDocument({
        productId: 'product-taxonomy-white-linen',
        category: root,
        title: 'Taxonomy White Linen',
        attributes: [
          { key: 'color', name: 'Color', optionValue: 'White' },
          { key: 'material', name: 'Material', optionValue: 'Linen' },
        ],
      }),
    ]);

    // Configured options that no eligible product matches (Red, Silk) are never
    // injected, so the exposed facets describe the eligible products.
    expect(facetOptionKeys(await listFacets(root.publicId))).toEqual({
      color: ['black', 'white'],
      material: ['cotton', 'linen'],
    });

    // Own filter excluded, other filters honored, for configured facets too.
    expect(facetOptionKeys(await listFacets(root.publicId, { attr_color: 'black' }))).toEqual({
      color: ['black', 'white'],
      material: ['cotton'],
    });
    expect(facetOptionKeys(await listFacets(root.publicId, { attr_material: 'linen' }))).toEqual({
      color: ['white'],
      material: ['cotton', 'linen'],
    });
  });

  it('exposes a deterministic label when configured attributes collide on a stable key', async () => {
    const root = await createRoot('Facet Collision Root');
    const child = await createChild(root, 'Facet Collision Child');
    const grandchild = await createChild(child, 'Facet Collision Grandchild');

    await buildCommandRepository().createAttribute({
      categoryId: child.id,
      key: 'material',
      name: 'Zzz Material',
      options: [{ value: 'Cotton', rank: 1 }],
    });
    await buildCommandRepository().createAttribute({
      categoryId: grandchild.id,
      key: 'material',
      name: 'Aaa Material',
      options: [{ value: 'Linen', rank: 1 }],
    });

    await seedProducts([
      buildSearchDocument({
        productId: 'product-collision-child',
        category: child,
        title: 'Collision Child',
        attributes: [{
          id: 'identity-zzz-material',
          key: 'material',
          name: 'Zzz Material',
          optionValue: 'Cotton',
        }],
      }),
      buildSearchDocument({
        productId: 'product-collision-grandchild',
        category: grandchild,
        title: 'Collision Grandchild',
        attributes: [{
          id: 'identity-aaa-material',
          key: 'material',
          name: 'Aaa Material',
          optionValue: 'Linen',
        }],
      }),
    ]);

    // The configured taxonomy defines the same stable key on two categories with
    // different labels; the exposed label is the deterministic one, not the
    // first ancestor definition a traversal happens to visit.
    expect((await listFacets(root.publicId)).facets.find((facet) => facet.facet_key === 'material')).toEqual({
      facet_key: 'material',
      attribute_name: 'Aaa Material',
      options: [
        { option_key: 'cotton', value: 'Cotton' },
        { option_key: 'linen', value: 'Linen' },
      ],
    });
  });
});
