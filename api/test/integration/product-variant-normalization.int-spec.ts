import { randomUUID } from 'node:crypto';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { Client } from 'pg';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import { ProductVariantLifecycleState } from '~/domains/product/domain/enums/product-variant-lifecycle-state.enum';
import { ProductState } from '~/domains/product/domain/enums/product-state.enum';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ProductInventoryEntity, ProductInventoryLifecycleState } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { ProductOptionEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-option.entity';
import { ProductOptionValueEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-option-value.entity';
import { ProductVariantEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-variant.entity';
import { ProductVariantOptionValueEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-variant-option-value.entity';
import { VARIANT_PRICE_TYPES, VariantPriceEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/variant-price.entity';
import { MikroOrmProductCommandRepository } from '~/domains/product/infra/persistence/mikro-orm/repositories/mikro-orm-product-command.repository';
import {
  InvalidProductVariantConfigurationError,
  ProductConfigurationConflictError,
} from '~/domains/product/app/errors/product-app.error';
import { Migration20260908100000 } from '../../database/migrations/Migration20260908100000';
import { createTestDatabase, dropTestDatabase, type TestDatabaseContext } from '../support/test-postgres';
import { CreateProductDraftFacadeUseCase } from '~/domains/product/app/use-cases/create-product-draft-facade/create-product-draft-facade.use-case';
import { ConfigureProductVariantConfigurationUseCase } from '~/domains/product/app/use-cases/configure-product-variant-configuration/configure-product-variant-configuration.use-case';
import { ok } from '~/platform/application/result';
import { ValidationPipe } from '@nestjs/common';
import { CreateProductDraftFacadeDto } from '~/domains/shop/api/rest/dto/create-product-draft-facade.dto';
import { SetProductShippingUseCase } from '~/domains/product/app/use-cases/set-product-shipping/set-product-shipping.use-case';

jest.setTimeout(120_000);

type RawDatabaseContext = TestDatabaseContext;

interface SqlCollectingMigration {
  addSql(sql: string): void;
  up(): Promise<void>;
}

async function createRawDatabase(suiteName: string): Promise<RawDatabaseContext> {
  const dbName = `arc_e2e_${suiteName}_${randomUUID().replace(/-/g, '_')}`;
  const rootConfig = {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
  };
  const admin = new Client({ ...rootConfig, database: 'postgres' });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${dbName}"`);
  }
  finally {
    await admin.end();
  }
  return { dbName, rootConfig };
}

async function collectMigrationSql(): Promise<string[]> {
  const statements: string[] = [];
  const MigrationClass = Migration20260908100000 as unknown as { new (): SqlCollectingMigration };
  const migration = new MigrationClass();
  migration.addSql = (sql: string) => {
    statements.push(sql);
  };
  await migration.up();
  return statements;
}

async function createLegacyProductSchema(client: Client): Promise<void> {
  await client.query(`
    create table products (
      id uuid primary key,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      shop_id uuid not null,
      title text not null,
      variant_type varchar(20) null,
      variant_group_name varchar(255) null,
      variant_sub_group_name varchar(255) null
    );
    create table product_variants (
      id uuid primary key,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      product_id uuid not null references products(id) on delete cascade,
      name varchar(255) not null,
      option_value_1 varchar(255) null,
      option_value_2 varchar(255) null,
      image_storage_key varchar(500) null,
      rank int not null default 1,
      lifecycle_state varchar(20) not null default 'active',
      removed_at timestamptz null
    );
    create table product_inventory (
      id uuid primary key,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      shop_id uuid not null,
      product_id uuid not null references products(id) on delete cascade,
      product_variant_id uuid null references product_variants(id) on delete cascade,
      sku varchar(255) null,
      stock int not null default 0,
      on_hand_quantity int not null default 0,
      reserved_quantity int not null default 0,
      on_hand_version int not null default 1,
      lifecycle_state varchar(20) not null default 'active',
      removed_at timestamptz null
    );
    create table checkout_quote_items (id uuid primary key);
    create table order_items (id uuid primary key);
  `);
}

async function runNormalizationMigration(client: Client): Promise<void> {
  const statements = await collectMigrationSql();
  await client.query('begin');
  try {
    for (const statement of statements) await client.query(statement);
    await client.query('commit');
  }
  catch (error) {
    await client.query('rollback');
    throw error;
  }
}

describe('product variant normalization migration', () => {
  let context: RawDatabaseContext;
  let client: Client;

  afterEach(async () => {
    if (client) await client.end();
    if (context) await dropTestDatabase(context);
  });

  it('backfills none, single, combined, and removed legacy products into normalized selections', async () => {
    context = await createRawDatabase('variant_normalization_backfill');
    client = new Client({ ...context.rootConfig, database: context.dbName });
    await client.connect();
    await createLegacyProductSchema(client);

    const shopId = randomUUID();
    const noneProductId = randomUUID();
    const singleProductId = randomUUID();
    const combineProductId = randomUUID();
    const removedProductId = randomUUID();
    const singleSmallId = randomUUID();
    const singleLargeId = randomUUID();
    const combineSmallBlueId = randomUUID();
    const combineSmallRedId = randomUUID();

    await client.query(
      `insert into products (id, shop_id, title, variant_type, variant_group_name, variant_sub_group_name) values
        ($1, $2, 'Default Mug', 'none', null, null),
        ($3, $2, 'Sized Bowl', 'single', 'Size', null),
        ($4, $2, 'Sized Shirt', 'combine', 'Size', 'Color'),
        ($5, $2, 'Archived Direct', 'none', null, null)`,
      [noneProductId, shopId, singleProductId, combineProductId, removedProductId],
    );
    await client.query(
      `insert into product_variants (id, product_id, name, option_value_1, option_value_2, rank, lifecycle_state, removed_at) values
        ($1, $2, 'Small', 'Small', null, 1, 'active', null),
        ($3, $2, 'Large', 'Large', null, 2, 'active', null),
        ($4, $5, 'Small / Blue', 'Small', 'Blue', 1, 'active', null),
        ($6, $5, 'Small / Red', 'Small', 'Red', 2, 'active', null)`,
      [singleSmallId, singleProductId, singleLargeId, combineSmallBlueId, combineProductId, combineSmallRedId],
    );
    await client.query(
      `insert into product_inventory (id, shop_id, product_id, product_variant_id, sku, stock, on_hand_quantity, lifecycle_state, removed_at) values
        ($1, $2, $3, null, 'DEFAULT', 3, 3, 'active', null),
        ($4, $2, $5, $6, 'SMALL', 4, 4, 'active', null),
        ($7, $2, $5, $8, 'LARGE', 5, 5, 'active', null),
        ($9, $2, $10, $11, 'SMALL-BLUE', 6, 6, 'active', null),
        ($12, $2, $10, $13, 'SMALL-RED', 7, 7, 'active', null),
        ($14, $2, $15, null, 'REMOVED', 0, 0, 'removed', now())`,
      [randomUUID(), shopId, noneProductId, randomUUID(), singleProductId, singleSmallId, randomUUID(), singleLargeId, randomUUID(), combineProductId, combineSmallBlueId, randomUUID(), combineSmallRedId, randomUUID(), removedProductId],
    );

    await runNormalizationMigration(client);

    const nullInventories = await client.query('select count(*)::int as count from product_inventory where product_variant_id is null');
    expect(nullInventories.rows[0].count).toBe(0);

    const options = await client.query('select product_id, name, position from product_options order by product_id, position');
    expect(options.rows).toEqual(expect.arrayContaining([
      { product_id: singleProductId, name: 'Size', position: 1 },
      { product_id: combineProductId, name: 'Size', position: 1 },
      { product_id: combineProductId, name: 'Color', position: 2 },
    ]));

    const combineSelections = await client.query(
      `select po.name as option_name, pov.value
       from product_variant_option_values selection
       join product_options po on po.id = selection.product_option_id
       join product_option_values pov on pov.id = selection.product_option_value_id
       where selection.product_variant_id = $1
       order by po.position`,
      [combineSmallBlueId],
    );
    expect(combineSelections.rows).toEqual([
      { option_name: 'Size', value: 'Small' },
      { option_name: 'Color', value: 'Blue' },
    ]);

    const removedDirect = await client.query(
      `select pv.lifecycle_state, pi.lifecycle_state as inventory_state
       from product_inventory pi
       join product_variants pv on pv.id = pi.product_variant_id
       where pi.product_id = $1`,
      [removedProductId],
    );
    expect(removedDirect.rows).toEqual([{ lifecycle_state: 'active', inventory_state: 'removed' }]);
  });

  it('rolls back malformed duplicate combinations before changing legacy tables', async () => {
    context = await createRawDatabase('variant_normalization_rollback');
    client = new Client({ ...context.rootConfig, database: context.dbName });
    await client.connect();
    await createLegacyProductSchema(client);

    const productId = randomUUID();
    await client.query(
      'insert into products (id, shop_id, title, variant_type, variant_group_name) values ($1, $2, \'Bad Bowl\', \'single\', \'Size\')',
      [productId, randomUUID()],
    );
    await client.query(
      `insert into product_variants (id, product_id, name, option_value_1, rank) values
        ($1, $2, 'Small A', 'Small', 1),
        ($3, $2, 'Small B', 'Small', 2)`,
      [randomUUID(), productId, randomUUID()],
    );

    await expect(runNormalizationMigration(client)).rejects.toThrow(/duplicate active variant combination/);
    const oldColumn = await client.query(
      'select column_name from information_schema.columns where table_name = \'products\' and column_name = \'variant_type\'',
    );
    expect(oldColumn.rows).toEqual([{ column_name: 'variant_type' }]);
    const normalizedTable = await client.query('select to_regclass(\'product_options\') as table_name');
    expect(normalizedTable.rows[0].table_name).toBeNull();
  });
});

describe('product variant configuration command repository', () => {
  let context: TestDatabaseContext;
  let orm: MikroORM;
  let em: EntityManager;
  let repository: MikroOrmProductCommandRepository;
  let shop: ShopEntity;
  let product: ProductEntity;
  let colorOption: ProductOptionEntity;
  let blueValue: ProductOptionValueEntity;
  let redValue: ProductOptionValueEntity;
  let blueVariant: ProductVariantEntity;
  let blueInventory: ProductInventoryEntity;

  beforeEach(async () => {
    context = await createTestDatabase('variant_configuration_command');
    orm = await MikroORM.init(buildDatabaseConfig({
      ...process.env,
      DB_HOST: context.rootConfig.host,
      DB_PORT: String(context.rootConfig.port),
      DB_USER: context.rootConfig.user,
      DB_PASSWORD: context.rootConfig.password,
      DB_NAME: context.dbName,
    }, { includeEntityGlobs: true }));
    em = orm.em.fork();
    repository = new MikroOrmProductCommandRepository(
      em,
      { getPublicUrl: (key: string) => `https://cdn.example.com/${key}` } as never,
      { resolve: async () => ({ amountMinor: 1200 }) } as never,
    );

    const owner = em.create(UserEntity, {
      email: `${randomUUID()}@example.com`,
      displayName: 'Owner',
      status: UserStatus.ACTIVE,
    });
    shop = em.create(ShopEntity, {
      ownerUser: owner,
      shopName: `Shop ${randomUUID()}`,
      slug: `shop-${randomUUID()}`,
      currency: 'USD',
    });
    product = em.create(ProductEntity, {
      shop,
      title: 'Configurable Shirt',
      slug: `shirt-${randomUUID()}`,
      description: 'A configurable shirt',
      state: ProductState.DRAFT,
      whoMade: ProductWhoMade.I_DID,
      isDigital: false,
      nonTaxable: false,
      tags: [],
      publicSortPrices: {},
      views: 0,
      ratingAverage: 0,
      reviewCount: 0,
      productVersion: 1,
    });
    colorOption = em.create(ProductOptionEntity, {
      product,
      name: 'Color',
      normalizedName: 'color',
      position: 1,
    });
    blueValue = em.create(ProductOptionValueEntity, {
      productOption: colorOption,
      value: 'Blue',
      normalizedValue: 'blue',
      position: 1,
    });
    redValue = em.create(ProductOptionValueEntity, {
      productOption: colorOption,
      value: 'Red',
      normalizedValue: 'red',
      position: 2,
    });
    blueVariant = em.create(ProductVariantEntity, {
      product,
      combinationKey: blueValue.id,
      rank: 1,
      lifecycleState: ProductVariantLifecycleState.ACTIVE,
    });
    const blueSelection = em.create(ProductVariantOptionValueEntity, {
      product,
      productVariant: blueVariant,
      productOption: colorOption,
      productOptionValue: blueValue,
    });
    blueInventory = em.create(ProductInventoryEntity, {
      shop,
      product,
      productVariant: blueVariant,
      sku: 'BLUE',
      stock: 5,
      onHandQuantity: 5,
      reservedQuantity: 0,
      onHandVersion: 1,
      lifecycleState: ProductInventoryLifecycleState.ACTIVE,
    });
    const bluePrice = em.create(VariantPriceEntity, {
      productInventory: blueInventory,
      amountMinor: 1200,
      currency: 'USD',
      priceType: VARIANT_PRICE_TYPES.BASE,
      activeFrom: new Date('2026-01-01T00:00:00.000Z'),
    });
    product.options.add(colorOption);
    colorOption.values.add(blueValue, redValue);
    product.variants.add(blueVariant);
    blueVariant.selections.add(blueSelection);
    product.inventoryRecords.add(blueInventory);
    blueInventory.prices.add(bluePrice);
    em.persist([owner, shop, product, colorOption, blueValue, redValue, blueVariant, blueSelection, blueInventory, bluePrice]);
    await em.flush();
    em.clear();
  });

  it('creates a no-option seller draft with stock and price without a client inventory version', async () => {
    const draft = await repository.createDraft({
      shopId: shop.id,
      title: 'Túi Doom',
      slug: `tui-doom-${randomUUID()}`,
      description: 'Túi Doom',
      whoMade: ProductWhoMade.I_DID,
      isDigital: false,
      nonTaxable: false,
    });
    const configure = new ConfigureProductVariantConfigurationUseCase(
      { findById: async () => draft } as never,
      repository,
      { findOwnedById: async () => shop } as never,
    );
    const facade = new CreateProductDraftFacadeUseCase(
      { execute: async () => ok(draft) } as never,
      {} as never,
      {} as never,
      configure,
      new SetProductShippingUseCase(
        { findById: async () => draft } as never,
        repository,
        { findOwnedById: async () => shop } as never,
      ),
    );
    const body = await new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }).transform({
      category_id: '323d5ca8-8a2b-44d8-9eb5-d02e65cf5e0e',
      title: 'Túi Doom',
      description: 'Túi Doom',
      who_made: 'i_did',
      is_digital: false,
      non_taxable: false,
      options: [],
      variants: [{ client_ref: 'default', selections: [], lifecycle_state: 'active' }],
      inventory: [{ variant_client_key: 'default', stock: 1 }],
      pricing: [{ variant_client_key: 'default', amount_minor: 12100, currency: 'USD' }],
      shipping: {
        origin_country: 'VN',
        origin_zip: '700000',
        process_time_label: '1d',
        destinations: [{
          country_code: 'VN', delivery_time_label: '2-4d', service: 'other', charge_type: 'free_shipping', 
        }],
      },
    }, { type: 'body', metatype: CreateProductDraftFacadeDto }) as CreateProductDraftFacadeDto;
    const result = await facade.execute({
      userId: shop.ownerUser.id,
      email: 'owner@example.com',
      status: UserStatus.ACTIVE,
      sessionId: randomUUID(),
      roles: [],
      permissions: [],
    }, {
      shopId: shop.id,
      ...body,
    });
    if (!result.isOk) throw result.error;
    const persisted = await em.fork().find(ProductInventoryEntity, { product: draft.id }, { populate: ['prices', 'productVariant'] });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      id: draft.inventory[0].id,
      productVariant: { id: draft.variants[0].id },
      onHandQuantity: 1,
      reservedQuantity: 0,
    });
    expect(persisted[0].prices.getItems()).toEqual([
      expect.objectContaining({ amountMinor: 12100, currency: 'USD' }),
    ]);
    expect(result.value.shipping).toMatchObject({
      originCountry: 'VN',
      originZip: '700000',
      destinations: [expect.objectContaining({ countryCode: 'VN', chargeType: 'free_shipping' })],
    });
  });

  it('replaces an existing variant base price without violating the active price constraint', async () => {
    const updated = await repository.configureVariantConfiguration({
      productId: product.id,
      shopId: shop.id,
      expectedProductVersion: 1,
      commandId: 'configure-price-change',
      options: [{
        id: colorOption.id, name: 'Color', position: 1, values: [{ id: blueValue.id, value: 'Blue', position: 1 }], 
      }],
      variants: [{
        id: blueVariant.id,
        selections: [{ optionId: colorOption.id, valueId: blueValue.id }],
        lifecycleState: ProductVariantLifecycleState.ACTIVE,
        inventory: {
          sku: 'BLUE',
          onHandQuantity: 5,
          expectedOnHandVersion: 1,
          amountMinor: 1500,
          currency: 'USD',
        },
      }],
      removedVariantIds: [],
    });

    expect(updated).toMatchObject({ productVersion: 2 });

    const persistedInventory = await em.fork().findOneOrFail(ProductInventoryEntity, blueInventory.id, { populate: ['prices'] });
    const prices = persistedInventory.prices.getItems().sort((left, right) => left.activeFrom.getTime() - right.activeFrom.getTime());
    expect(prices).toHaveLength(2);
    expect(prices[0]).toMatchObject({ amountMinor: 1200, currency: 'USD' });
    expect(prices[0].activeTo).toBeInstanceOf(Date);
    expect(prices[1]).toMatchObject({ amountMinor: 1500, currency: 'USD', activeTo: null });
  });

  it('retires a replaced option value before inserting the same label during published expansion', async () => {
    await em.fork().nativeUpdate(ProductEntity, product.id, { publishedAt: new Date() });
    const updated = await repository.configureVariantConfiguration({
      productId: product.id,
      shopId: shop.id,
      expectedProductVersion: 1,
      options: [{
        id: colorOption.id,
        name: 'Color',
        position: 1,
        values: [{ clientRef: 'replacement-blue', value: 'Blue', position: 1 }],
      }, {
        clientRef: 'size',
        name: 'Size',
        position: 2,
        values: [{ clientRef: 'xl', value: 'XL', position: 1 }],
      }],
      variants: [{
        clientRef: 'replacement',
        selections: [
          { optionId: colorOption.id, valueRef: 'replacement-blue' },
          { optionRef: 'size', valueRef: 'xl' },
        ],
        lifecycleState: ProductVariantLifecycleState.ACTIVE,
        inventory: {
          onHandQuantity: 313, sku: 'EXPANDED', amountMinor: 1200, currency: 'USD', 
        },
      }],
      removedVariantIds: [blueVariant.id],
    });
    expect(updated?.productVersion).toBe(2);
    const fresh = em.fork();
    const historicalValue = await fresh.findOneOrFail(ProductOptionValueEntity, blueValue.id);
    expect(historicalValue.removedAt).toBeInstanceOf(Date);
    const replacementValue = await fresh.findOneOrFail(ProductOptionValueEntity, {
      productOption: colorOption.id, normalizedValue: 'blue', removedAt: null,
    });
    expect(replacementValue.id).not.toBe(blueValue.id);
    const historicalVariant = await fresh.findOneOrFail(ProductVariantEntity, blueVariant.id);
    expect(historicalVariant.lifecycleState).toBe(ProductVariantLifecycleState.REMOVED);
    const replacementInventory = await fresh.findOneOrFail(ProductInventoryEntity, { product: product.id, sku: 'EXPANDED' });
    expect(replacementInventory.onHandQuantity).toBe(313);
    expect(replacementInventory.id).not.toBe(blueInventory.id);
  });

  afterEach(async () => {
    await orm?.close(true);
    if (context) await dropTestDatabase(context);
  });

  it('rejects stale product versions, stale on-hand versions, duplicate SKUs, and reserved removals without partial writes', async () => {
    await expect(repository.configureVariantConfiguration({
      productId: product.id,
      shopId: shop.id,
      expectedProductVersion: 0,
      options: [{
        id: colorOption.id, name: 'Color', position: 1, values: [{ id: blueValue.id, value: 'Blue', position: 1 }], 
      }],
      variants: [{ id: blueVariant.id, selections: [{ optionId: colorOption.id, valueId: blueValue.id }], lifecycleState: ProductVariantLifecycleState.ACTIVE }],
      removedVariantIds: [],
    })).resolves.toBeNull();

    await expect(repository.configureVariantConfiguration({
      productId: product.id,
      shopId: shop.id,
      expectedProductVersion: 1,
      options: [{
        id: colorOption.id, name: 'Color', position: 1, values: [{ id: blueValue.id, value: 'Blue', position: 1 }], 
      }],
      variants: [{
        id: blueVariant.id, selections: [{ optionId: colorOption.id, valueId: blueValue.id }], lifecycleState: ProductVariantLifecycleState.ACTIVE, inventory: { onHandQuantity: 6, expectedOnHandVersion: 0 }, 
      }],
      removedVariantIds: [],
    })).rejects.toThrow(ProductConfigurationConflictError);

    const conflictingProduct = em.create(ProductEntity, {
      shop: em.getReference(ShopEntity, shop.id),
      title: 'Other',
      slug: `other-${randomUUID()}`,
      description: 'Other product',
      state: ProductState.DRAFT,
      whoMade: ProductWhoMade.I_DID,
      isDigital: false,
      nonTaxable: false,
      tags: [],
      publicSortPrices: {},
      views: 0,
      ratingAverage: 0,
      reviewCount: 0,
      productVersion: 1,
    });
    const conflictingVariant = em.create(ProductVariantEntity, { product: conflictingProduct, combinationKey: '__default__', rank: 1 });
    const conflictingInventory = em.create(ProductInventoryEntity, {
      shop: em.getReference(ShopEntity, shop.id),
      product: conflictingProduct,
      productVariant: conflictingVariant,
      sku: 'RED',
      stock: 1,
      onHandQuantity: 1,
      reservedQuantity: 0,
      onHandVersion: 1,
      lifecycleState: ProductInventoryLifecycleState.ACTIVE,
    });
    conflictingProduct.variants.add(conflictingVariant);
    conflictingProduct.inventoryRecords.add(conflictingInventory);
    em.persist([conflictingProduct, conflictingVariant, conflictingInventory]);
    await em.flush();

    await expect(repository.configureVariantConfiguration({
      productId: product.id,
      shopId: shop.id,
      expectedProductVersion: 1,
      options: [{
        id: colorOption.id, name: 'Color', position: 1, values: [{ id: blueValue.id, value: 'Blue', position: 1 }, { id: redValue.id, value: 'Red', position: 2 }], 
      }],
      variants: [
        { id: blueVariant.id, selections: [{ optionId: colorOption.id, valueId: blueValue.id }], lifecycleState: ProductVariantLifecycleState.ACTIVE },
        {
          clientRef: 'red',
          selections: [{ optionId: colorOption.id, valueId: redValue.id }],
          lifecycleState: ProductVariantLifecycleState.ACTIVE,
          inventory: {
            sku: 'RED', onHandQuantity: 2, amountMinor: 1300, currency: 'USD', 
          }, 
        },
      ],
      removedVariantIds: [],
    })).rejects.toMatchObject({
      code: 'ProductSkuConflict',
      skuConflicts: [expect.objectContaining({
        sku: 'RED',
        clientRef: 'red',
      })],
    });

    await em.fork().nativeUpdate(ProductInventoryEntity, { id: blueInventory.id }, { reservedQuantity: 1 });
    await expect(repository.configureVariantConfiguration({
      productId: product.id,
      shopId: shop.id,
      expectedProductVersion: 1,
      options: [],
      variants: [{
        clientRef: 'default',
        selections: [],
        lifecycleState: ProductVariantLifecycleState.ACTIVE,
        inventory: {
          sku: 'DEFAULT', onHandQuantity: 1, amountMinor: 1000, currency: 'USD', 
        }, 
      }],
      removedVariantIds: [blueVariant.id],
    })).rejects.toThrow(ProductConfigurationConflictError);

    const unchanged = await em.fork().findOneOrFail(ProductEntity, product.id, { populate: ['variants', 'inventoryRecords'] });
    expect(unchanged.productVersion).toBe(1);
    expect(unchanged.variants.getItems()).toHaveLength(1);
    expect(unchanged.inventoryRecords.getItems()[0].reservedQuantity).toBe(1);
  });

  it('rejects stale detail edits without requiring callers to open a transaction', async () => {
    await expect(repository.updateDetails({
      productId: product.id,
      expectedProductVersion: 0,
      title: 'Stale title',
      slug: 'stale-title',
      description: product.description,
      whoMade: product.whoMade,
      isDigital: product.isDigital,
      categoryId: product.category?.id,
      nonTaxable: product.nonTaxable,
      tags: product.tags,
    })).resolves.toBeNull();

    const updated = await repository.updateDetails({
      productId: product.id,
      expectedProductVersion: 1,
      title: 'Fresh title',
      slug: 'fresh-title',
      description: product.description,
      whoMade: product.whoMade,
      isDigital: product.isDigital,
      categoryId: product.category?.id,
      nonTaxable: product.nonTaxable,
      tags: product.tags,
    });

    expect(updated?.title).toBe('Fresh title');
    expect(updated?.productVersion).toBe(2);
  });

  it('creates, restores, rolls back malformed requests, and preserves idempotent retries as no duplicate selections', async () => {
    const first = await repository.configureVariantConfiguration({
      productId: product.id,
      shopId: shop.id,
      expectedProductVersion: 1,
      commandId: 'configure-1',
      options: [{
        id: colorOption.id, name: 'Color', position: 1, values: [{ id: blueValue.id, value: 'Blue', position: 1 }, { id: redValue.id, value: 'Red', position: 2 }], 
      }],
      variants: [
        {
          id: blueVariant.id,
          selections: [{ optionId: colorOption.id, valueId: blueValue.id }],
          lifecycleState: ProductVariantLifecycleState.ACTIVE,
          inventory: {
            sku: 'BLUE', onHandQuantity: 6, expectedOnHandVersion: 1, amountMinor: 1200, currency: 'USD', 
          }, 
        },
        {
          clientRef: 'red',
          selections: [{ optionId: colorOption.id, valueId: redValue.id }],
          lifecycleState: ProductVariantLifecycleState.INACTIVE,
          inventory: {
            sku: 'RED-NEW', onHandQuantity: 2, amountMinor: 1300, currency: 'USD', 
          }, 
        },
      ],
      removedVariantIds: [],
    });
    expect(first?.variants).toHaveLength(2);
    const redVariant = first!.variants.find((variant) => variant.selections.some((selection) => selection.valueId === redValue.id))!;
    expect(redVariant.lifecycleState).toBe(ProductVariantLifecycleState.INACTIVE);
    const redInventory = first!.inventory.find((inventory) => inventory.productVariantId === redVariant.id)!;
    expect(redInventory.stock).toBe(2);
    expect(redInventory.onHandQuantity).toBe(2);
    expect(redInventory.lifecycleState).toBe(ProductInventoryLifecycleState.INACTIVE);

    const retry = await repository.configureVariantConfiguration({
      productId: product.id,
      shopId: shop.id,
      expectedProductVersion: 2,
      options: [{
        id: colorOption.id, name: 'Color', position: 1, values: [{ id: blueValue.id, value: 'Blue', position: 1 }, { id: redValue.id, value: 'Red', position: 2 }], 
      }],
      variants: [
        { id: blueVariant.id, selections: [{ optionId: colorOption.id, valueId: blueValue.id }], lifecycleState: ProductVariantLifecycleState.ACTIVE },
        { id: redVariant.id, selections: [{ optionId: colorOption.id, valueId: redValue.id }], lifecycleState: ProductVariantLifecycleState.INACTIVE },
      ],
      removedVariantIds: [],
    });
    expect(retry).toMatchObject({ productVersion: 3 });
    expect(retry?.inventory.find((inventory) => inventory.productVariantId === redVariant.id)?.sku).toBe('RED-NEW');
    expect(retry?.inventory.find((inventory) => inventory.productVariantId === redVariant.id)?.onHandQuantity).toBe(2);

    await expect(repository.configureVariantConfiguration({
      productId: product.id,
      shopId: shop.id,
      expectedProductVersion: 3,
      options: [{
        id: colorOption.id, name: 'Color', position: 1, values: [{ id: blueValue.id, value: 'Blue', position: 1 }], 
      }],
      variants: [{ id: blueVariant.id, selections: [{ optionId: colorOption.id, valueId: blueValue.id }], lifecycleState: ProductVariantLifecycleState.ACTIVE }],
      removedVariantIds: [redVariant.id],
    })).resolves.toMatchObject({ productVersion: 4 });

    const restored = await repository.configureVariantConfiguration({
      productId: product.id,
      shopId: shop.id,
      expectedProductVersion: 4,
      options: [{
        id: colorOption.id, name: 'Color', position: 1, values: [{ id: blueValue.id, value: 'Blue', position: 1 }, { id: redValue.id, value: 'Red', position: 2 }], 
      }],
      variants: [
        { id: blueVariant.id, selections: [{ optionId: colorOption.id, valueId: blueValue.id }], lifecycleState: ProductVariantLifecycleState.ACTIVE },
        { id: redVariant.id, selections: [{ optionId: colorOption.id, valueId: redValue.id }], lifecycleState: ProductVariantLifecycleState.ACTIVE },
      ],
      removedVariantIds: [],
      restoreVariantIds: [redVariant.id],
    });
    expect(restored?.variants.find((variant) => variant.id === redVariant.id)?.lifecycleState).toBe(ProductVariantLifecycleState.ACTIVE);
    const restoredRedVariant = restored?.variants.find((variant) => variant.id === redVariant.id);
    expect(restoredRedVariant?.selections).toEqual([{ optionId: colorOption.id, valueId: redValue.id }]);
    expect(restored?.inventory.find((inventory) => inventory.productVariantId === redVariant.id)?.id).toBe(redInventory.id);

    await expect(repository.configureVariantConfiguration({
      productId: product.id,
      shopId: shop.id,
      expectedProductVersion: restored!.productVersion!,
      options: [{
        id: colorOption.id, name: 'Color', position: 1, values: [{ id: blueValue.id, value: 'Blue', position: 1 }, { id: redValue.id, value: 'Red', position: 2 }], 
      }],
      variants: [{
        clientRef: 'bad',
        selections: [{ optionId: colorOption.id, valueId: blueValue.id }, { optionId: colorOption.id, valueId: redValue.id }],
        lifecycleState: ProductVariantLifecycleState.ACTIVE,
        inventory: {
          sku: 'BAD', onHandQuantity: 1, amountMinor: 1000, currency: 'USD', 
        }, 
      }],
      removedVariantIds: [blueVariant.id, redVariant.id],
    })).rejects.toBeInstanceOf(InvalidProductVariantConfigurationError);

    const persisted = await em.fork().findOneOrFail(ProductEntity, product.id, { populate: ['variants.selections', 'inventoryRecords'] });
    expect(persisted.productVersion).toBe(restored!.productVersion);
    expect(persisted.variants.getItems().flatMap((variant) => variant.selections.getItems())).toHaveLength(2);
    expect(persisted.inventoryRecords.getItems().filter((inventory) => inventory.lifecycleState !== ProductInventoryLifecycleState.REMOVED)).toHaveLength(2);
  });
});
