import { randomUUID } from 'node:crypto';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ProductVariantEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-variant.entity';
import {
  ProductInventoryEntity,
  ProductInventoryLifecycleState,
} from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { ProductVariantLifecycleState } from '~/domains/product/domain/enums/product-variant-lifecycle-state.enum';
import { ProductState } from '~/domains/product/domain/enums/product-state.enum';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';
import { MikroOrmInventoryStockPoolRepository } from '~/domains/product/infra/persistence/mikro-orm/repositories/mikro-orm-inventory-stock-pool.repository';
import { StockPoolVersionConflictError } from '~/domains/product/app/errors/product-app.error';
import { CheckoutStockReservationService } from '~/domains/checkout/app/services/checkout-stock-reservation.service';
import { MikroOrmCheckoutInventoryQueryRepository } from '~/domains/checkout/infra/persistence/repositories/mikro-orm-checkout-inventory-query.repository';
import { MikroOrmCheckoutStockReservationCommandRepository } from '~/domains/checkout/infra/persistence/repositories/mikro-orm-checkout-stock-reservation-command.repository';
import {
  createTestDatabase,
  dropTestDatabase,
  type TestDatabaseContext,
} from '../support/test-postgres';

jest.setTimeout(120_000);

type PoolRow = {
  id: string;
  is_default: boolean;
  custody: string;
  on_hand_quantity: number;
  reserved_quantity: number;
  on_hand_version: number;
};

type InventoryRow = {
  on_hand_quantity: number;
  reserved_quantity: number;
  on_hand_version: number;
  stock: number;
};

describe('Inventory stock pool authority (integration)', () => {
  let testDb: TestDatabaseContext;
  let orm: MikroORM;
  let em: EntityManager;
  let shop: ShopEntity;

  const stockPoolService = new MikroOrmInventoryStockPoolRepository();

  beforeAll(async () => {
    testDb = await createTestDatabase('inventory_stock_pool');
    orm = await MikroORM.init(
      buildDatabaseConfig(
        {
          ...process.env,
          DB_HOST: testDb.rootConfig.host,
          DB_PORT: String(testDb.rootConfig.port),
          DB_USER: testDb.rootConfig.user,
          DB_PASSWORD: testDb.rootConfig.password,
          DB_NAME: testDb.dbName,
        },
        { includeEntityGlobs: true },
      ),
    );
    em = orm.em.fork();

    const owner = em.create(UserEntity, {
      email: `owner-${randomUUID()}@example.com`,
      displayName: 'Owner',
      status: UserStatus.ACTIVE,
    });
    shop = em.create(ShopEntity, {
      ownerUser: owner,
      shopName: `Shop ${randomUUID()}`,
      slug: `shop-${randomUUID()}`,
      currency: 'USD',
    });
    em.persist([owner, shop]);
    await em.flush();
    em.clear();
  });

  afterAll(async () => {
    if (orm) {
      await orm.close(true);
    }
    if (testDb) {
      await dropTestDatabase(testDb);
    }
  });

  async function createInventory(onHand: number): Promise<ProductInventoryEntity> {
    const entityManager = orm.em.fork();
    const product = entityManager.create(ProductEntity, {
      shop: entityManager.getReference(ShopEntity, shop.id),
      title: `Product ${randomUUID()}`,
      slug: `product-${randomUUID()}`,
      description: 'Stock pool fixture',
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
    const variant = entityManager.create(ProductVariantEntity, {
      product,
      combinationKey: '__default__',
      rank: 1,
      lifecycleState: ProductVariantLifecycleState.ACTIVE,
    });
    const inventory = entityManager.create(ProductInventoryEntity, {
      shop: entityManager.getReference(ShopEntity, shop.id),
      product,
      productVariant: variant,
      sku: `SKU-${randomUUID().slice(0, 8)}`,
      stock: onHand,
      onHandQuantity: onHand,
      reservedQuantity: 0,
      onHandVersion: 1,
      lifecycleState: ProductInventoryLifecycleState.ACTIVE,
    });
    product.inventoryRecords.add(inventory);
    entityManager.persist([product, variant, inventory]);
    await entityManager.flush();

    await stockPoolService.openSellerPool(entityManager, {
      inventoryId: inventory.id,
      shopId: shop.id,
      onHandQuantity: onHand,
      commandId: `${inventory.id}:opening`,
    });

    return inventory;
  }

  async function insertQuote(quoteId: string): Promise<void> {
    await em.execute(
      `
        insert into checkout_quotes (
          id, actor_type, cart_id, checkout_currency, subtotal_minor, total_minor,
          shipping_address, expires_at, created_at, updated_at, priced_shops
        )
        values (?::uuid, 'guest', ?, 'USD', 0, 0, '{}', now() + interval '30 minutes', now(), now(), '[]')
      `,
      [quoteId, randomUUID()],
    );
  }

  async function readPool(inventoryId: string): Promise<PoolRow> {
    const rows = await em.execute<PoolRow[]>(
      `
        select id, is_default, custody, on_hand_quantity, reserved_quantity, on_hand_version
        from product_stock_pool
        where inventory_id = ?::uuid and is_default = true
      `,
      [inventoryId],
    );
    return rows[0];
  }

  async function readInventory(inventoryId: string): Promise<InventoryRow> {
    const rows = await em.execute<InventoryRow[]>(
      `
        select on_hand_quantity, reserved_quantity, on_hand_version, stock
        from product_inventory
        where id = ?::uuid
      `,
      [inventoryId],
    );
    return rows[0];
  }

  it('creates one default seller pool and mirrors the aggregate', async () => {
    const inventory = await createInventory(5);

    const pool = await readPool(inventory.id);
    expect(pool.is_default).toBe(true);
    expect(pool.custody).toBe('seller');
    expect(pool.on_hand_quantity).toBe(5);
    expect(pool.reserved_quantity).toBe(0);
    expect(pool.on_hand_version).toBe(1);

    const aggregate = await readInventory(inventory.id);
    expect(aggregate).toEqual({
      on_hand_quantity: 5,
      reserved_quantity: 0,
      on_hand_version: 1,
      stock: 5,
    });
  });

  it('derives the product_inventory aggregate in the database, not in application writers', async () => {
    const inventory = await createInventory(5);

    // No service or repository call: only the pool row changes, and the database
    // is what keeps the derived aggregate honest.
    await em.execute(
      `
        update product_stock_pool
        set on_hand_quantity = 9,
            stock = 9
        where inventory_id = ?::uuid and is_default = true
      `,
      [inventory.id],
    );

    expect(await readInventory(inventory.id)).toEqual({
      on_hand_quantity: 9,
      reserved_quantity: 0,
      on_hand_version: 1,
      stock: 9,
    });
  });

  it('records counts against the pool and rejects a stale On-hand Version', async () => {
    const inventory = await createInventory(5);
    const entityManager = orm.em.fork();

    const balance = await entityManager.transactional(async (manager) =>
      stockPoolService.countSellerPool(manager, {
        inventoryId: inventory.id,
        onHandQuantity: 4,
        expectedOnHandVersion: 1,
        commandId: `${inventory.id}:count-1`,
        actorId: 'seller-1',
      }));
    expect(balance.onHandQuantity).toBe(4);
    expect(balance.onHandVersion).toBe(2);

    const movement = await em.execute<Array<{ stock_pool_id: string; movement_kind: string; inventory_id: string }>>(
      `
        select stock_pool_id, movement_kind, inventory_id
        from inventory_movements
        where inventory_id = ?::uuid
        order by created_at
      `,
      [inventory.id],
    );
    expect(movement).toHaveLength(2);
    expect(movement.every((row) => row.stock_pool_id === balance.stockPoolId)).toBe(true);

    await expect(
      entityManager.transactional(async (manager) =>
        stockPoolService.countSellerPool(manager, {
          inventoryId: inventory.id,
          onHandQuantity: 9,
          expectedOnHandVersion: 1,
          commandId: `${inventory.id}:count-2`,
        })),
    ).rejects.toBeInstanceOf(StockPoolVersionConflictError);

    const pool = await readPool(inventory.id);
    expect(pool.on_hand_quantity).toBe(4);
    expect(pool.on_hand_version).toBe(2);
  });

  it('serializes concurrent counts so only one wins for a version', async () => {
    const inventory = await createInventory(5);

    const first = orm.em.fork();
    const second = orm.em.fork();

    const results = await Promise.allSettled([
      first.transactional(async (manager) =>
        stockPoolService.countSellerPool(manager, {
          inventoryId: inventory.id,
          onHandQuantity: 7,
          expectedOnHandVersion: 1,
          commandId: `${inventory.id}:count-a`,
        })),
      second.transactional(async (manager) =>
        stockPoolService.countSellerPool(manager, {
          inventoryId: inventory.id,
          onHandQuantity: 8,
          expectedOnHandVersion: 1,
          commandId: `${inventory.id}:count-b`,
        })),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(StockPoolVersionConflictError);

    const pool = await readPool(inventory.id);
    expect(pool.on_hand_version).toBe(2);
    expect([7, 8]).toContain(pool.on_hand_quantity);
  });

  it('reserves, consumes, and restores against the recorded pool exactly once', async () => {
    const inventory = await createInventory(5);
    const reservations = new CheckoutStockReservationService(
      orm.em,
      new MikroOrmCheckoutInventoryQueryRepository(orm.em),
      new MikroOrmCheckoutStockReservationCommandRepository(),
    );
    const quoteId = randomUUID();
    await insertQuote(quoteId);

    await orm.em.fork().transactional(async (manager) =>
      reservations.reserveForQuote(manager, {
        quoteId,
        cartId: randomUUID(),
        expiresAt: new Date(Date.now() + (30 * 60 * 1000)),
        items: [{
          inventoryId: inventory.id,
          quantity: 2,
          title: 'Product',
        }],
      }));

    const pool = await readPool(inventory.id);
    expect(pool.reserved_quantity).toBe(2);
    expect(pool.on_hand_quantity).toBe(5);
    expect(pool.on_hand_version).toBe(1);

    const reservationRows = await em.execute<Array<{ stock_pool_id: string }>>(
      'select stock_pool_id from checkout_stock_reservations where quote_id = ?::uuid',
      [quoteId],
    );
    expect(reservationRows[0].stock_pool_id).toBe(pool.id);

    let aggregate = await readInventory(inventory.id);
    expect(aggregate.reserved_quantity).toBe(2);
    expect(aggregate.on_hand_version).toBe(1);

    await orm.em.fork().transactional(async (manager) =>
      reservations.consumeReservationsForQuote(manager, {
        quoteId,
        items: [{ inventoryId: inventory.id, quantity: 2 }],
      }));

    const afterConsume = await readPool(inventory.id);
    expect(afterConsume.on_hand_quantity).toBe(3);
    expect(afterConsume.reserved_quantity).toBe(0);
    expect(afterConsume.on_hand_version).toBe(1);

    const saleMovement = await em.execute<Array<{
      on_hand_before: number;
      on_hand_after: number;
      reserved_before: number;
      reserved_after: number;
      quantity_delta: number;
    }>>(
      `
        select on_hand_before, on_hand_after, reserved_before, reserved_after, quantity_delta
        from inventory_movements
        where stock_pool_id = ?::uuid and movement_kind = 'sale'
      `,
      [afterConsume.id],
    );
    expect(saleMovement).toHaveLength(1);
    expect(saleMovement[0]).toEqual({
      on_hand_before: 5,
      on_hand_after: 3,
      reserved_before: 2,
      reserved_after: 0,
      quantity_delta: -2,
    });

    const restore = async (): Promise<void> => {
      await orm.em.fork().transactional(async (manager) =>
        reservations.restoreInventoryForOrderItems(
          manager,
          [{ inventoryId: inventory.id, productId: inventory.product.id, quantity: 2 }],
          { commandId: `${inventory.id}:restore`, cause: 'order_canceled' },
        ));
    };

    await restore();
    const afterRestore = await readPool(inventory.id);
    expect(afterRestore.on_hand_quantity).toBe(5);
    expect(afterRestore.reserved_quantity).toBe(0);

    await restore();
    const afterReplay = await readPool(inventory.id);
    expect(afterReplay.on_hand_quantity).toBe(5);

    const corrections = await em.execute<Array<{ count: number }>>(
      `
        select count(*)::int as count
        from inventory_movements
        where stock_pool_id = ?::uuid and movement_kind = 'correction'
      `,
      [afterRestore.id],
    );
    expect(corrections[0].count).toBe(1);

    aggregate = await readInventory(inventory.id);
    expect(aggregate.on_hand_quantity).toBe(5);
    expect(aggregate.reserved_quantity).toBe(0);
    expect(aggregate.stock).toBe(5);
  });

  it('expires an active hold by releasing Reserved Quantity without changing On-hand Quantity', async () => {
    const inventory = await createInventory(4);
    const reservations = new CheckoutStockReservationService(
      orm.em,
      new MikroOrmCheckoutInventoryQueryRepository(orm.em),
      new MikroOrmCheckoutStockReservationCommandRepository(),
    );
    const quoteId = randomUUID();
    await insertQuote(quoteId);

    await orm.em.fork().transactional(async (manager) =>
      reservations.reserveForQuote(manager, {
        quoteId,
        cartId: randomUUID(),
        expiresAt: new Date(Date.now() - 60_000),
        items: [{
          inventoryId: inventory.id,
          quantity: 3,
          title: 'Product',
        }],
      }));

    const released = await orm.em.fork().transactional(async (manager) =>
      reservations.expireReservationsForQuote(manager, quoteId));
    expect(released).toBe(1);

    const pool = await readPool(inventory.id);
    expect(pool.on_hand_quantity).toBe(4);
    expect(pool.reserved_quantity).toBe(0);
    expect(pool.on_hand_version).toBe(1);

    const releaseMovement = await em.execute<Array<{ movement_kind: string; quantity_delta: number }>>(
      `
        select movement_kind, quantity_delta
        from inventory_movements
        where stock_pool_id = ?::uuid and movement_kind = 'release'
      `,
      [pool.id],
    );
    expect(releaseMovement).toHaveLength(1);
    expect(releaseMovement[0].quantity_delta).toBe(3);
  });

  it('sells directly for an order, applies the command exactly once, and refuses an uncovered item', async () => {
    const inventory = await createInventory(5);
    const reservations = new CheckoutStockReservationService(
      orm.em,
      new MikroOrmCheckoutInventoryQueryRepository(orm.em),
      new MikroOrmCheckoutStockReservationCommandRepository(),
    );
    const allocate = (inventoryId: string, quantity: number, title = 'Product') =>
      orm.em.fork().transactional(async (manager) =>
        reservations.allocateInventoryForOrderItems(
          manager,
          [{
            inventoryId,
            productId: inventory.product.id,
            quantity,
            title,
          }],
          { commandId: `${inventoryId}:allocate` },
        ));

    const { inventoryById, inventoryEvents } = await allocate(inventory.id, 2);

    const pool = await readPool(inventory.id);
    expect(pool.on_hand_quantity).toBe(3);
    expect(pool.reserved_quantity).toBe(0);

    const returned = inventoryById.get(inventory.id);
    expect(returned?.onHandQuantity).toBe(3);
    expect(returned?.stock).toBe(3);
    expect(inventoryEvents).toEqual([expect.objectContaining({
      inventoryId: inventory.id,
      productId: inventory.product.id,
      stock: 3,
    })]);
    expect(await readInventory(inventory.id)).toEqual({
      on_hand_quantity: 3,
      reserved_quantity: 0,
      on_hand_version: 1,
      stock: 3,
    });

    // The idempotency guard is the recorded movement, so a replayed command
    // cannot sell the quantity twice: it finds the movement and fails the item
    // instead of applying a second sale.
    await expect(allocate(inventory.id, 2)).rejects.toBeInstanceOf(BadRequestException);
    expect((await readPool(inventory.id)).on_hand_quantity).toBe(3);

    await expect(allocate(inventory.id, 4)).rejects.toBeInstanceOf(BadRequestException);
    expect((await readPool(inventory.id)).on_hand_quantity).toBe(3);

    await expect(allocate(randomUUID(), 1)).rejects.toBeInstanceOf(NotFoundException);

    const sales = await em.execute<Array<{ quantity_delta: number }>>(
      `
        select quantity_delta
        from inventory_movements
        where stock_pool_id = ?::uuid and movement_kind = 'sale'
      `,
      [pool.id],
    );
    expect(sales).toEqual([{ quantity_delta: -2 }]);
  });
});
