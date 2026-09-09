import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { ProductState } from '~/domains/product/domain/enums/product-state.enum';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';
import { ProductImageVariant } from '~/domains/product/domain/enums/product-image-variant.enum';
import { ProductShippingCharge } from '~/domains/product/domain/enums/product-shipping-charge.enum';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { CategoryEntity } from '~/domains/category/infra/persistence/entities/category.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ProductImageEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-image.entity';
import { ProductImageVariantEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-image-variant.entity';
import { ProductVariantEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-variant.entity';
import { ProductOptionEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-option.entity';
import { ProductOptionValueEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-option-value.entity';
import { ProductVariantOptionValueEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-variant-option-value.entity';
import { ProductInventoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { VariantPriceEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/variant-price.entity';
import { ProductShippingProfileEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-shipping-profile.entity';
import type { TestDatabaseContext } from '../support/test-postgres';
import { ProductShippingDestinationEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-shipping-destination.entity';
import { MikroOrmSellerProductQueryRepository } from '~/domains/product/infra/persistence/mikro-orm/repositories/mikro-orm-seller-product-query.repository';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';

jest.setTimeout(30_000);

describe('MikroOrmSellerProductQueryRepository (integration)', () => {
  let orm: MikroORM;
  let entityManager: EntityManager;
  let testDb: TestDatabaseContext;
  let repository: MikroOrmSellerProductQueryRepository;
  let shop: ShopEntity;
  let category: CategoryEntity;

  beforeAll(async () => {
    testDb = await createTestDatabase('seller_product_query');
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
    entityManager = orm.em.fork();
    repository = new MikroOrmSellerProductQueryRepository(
      entityManager,
      { getPublicUrl: (key: string) => `https://cdn.example.test/${key}` } as never,
    );

    await seedProducts(entityManager);
  });

  afterAll(async () => {
    if (orm) {
      await orm.close(true);
    }

    if (testDb) {
      await dropTestDatabase(testDb);
    }
  });

  it('pages by product rows before hydrating collection relations', async () => {
    const result = await repository.listByShop({
      shopId: shop.id,
      page: 1,
      limit: 1,
      categoryId: category.id,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: '00000000-0000-4000-8000-00000000000f',
      title: 'Needle Case',
      images: [
        { storageKey: 'products/needle/main.jpg' },
        { storageKey: 'products/needle/side.jpg' },
      ],
      variants: [
        { name: 'Small' },
        { name: 'Large' },
      ],
      inventory: [
        { sku: 'NEEDLE-S', amountMinor: 1200, currency: 'USD' },
        { sku: 'NEEDLE-L', amountMinor: 1500, currency: 'USD' },
      ],
      shipping: {
        originCountry: 'US',
        destinations: [
          { service: 'USPS Ground' },
          { service: 'USPS Priority' },
        ],
      },
    });
    expect(result.meta.total).toBe(4);
    expect(result.stateCounts).toEqual({
      all: 4,
      active: 1,
      inactive: 1,
      draft: 1,
    });
  });

  it('keeps state counts independent of the selected state and respects search/category', async () => {
    const result = await repository.listByShop({
      shopId: shop.id,
      page: 1,
      limit: 10,
      state: ProductState.ACTIVE,
      categoryId: category.id,
      search: 'needle',
    });

    expect(result.items.map((item) => item.id)).toEqual([
      '00000000-0000-4000-8000-00000000000f',
    ]);
    expect(result.meta.total).toBe(1);
    expect(result.stateCounts).toEqual({
      all: 3,
      active: 1,
      inactive: 0,
      draft: 1,
    });
  });

  it('escapes search wildcards as literal substring characters', async () => {
    const result = await repository.listByShop({
      shopId: shop.id,
      page: 1,
      limit: 10,
      categoryId: category.id,
      search: '%',
    });

    expect(result.items.map((item) => item.slug)).toEqual(['thread-holder']);
    expect(result.stateCounts).toEqual({
      all: 1,
      active: 0,
      inactive: 0,
      draft: 1,
    });
  });

  it('excludes removed products by default but supports explicit removed state', async () => {
    const defaultResult = await repository.listByShop({
      shopId: shop.id,
      page: 1,
      limit: 10,
      categoryId: category.id,
      search: 'needle',
    });
    const removedResult = await repository.listByShop({
      shopId: shop.id,
      page: 1,
      limit: 10,
      state: ProductState.REMOVED,
      categoryId: category.id,
      search: 'needle',
    });

    expect(defaultResult.items.map((item) => item.state)).not.toContain(ProductState.REMOVED);
    expect(defaultResult.meta.total).toBe(3);
    expect(removedResult.items.map((item) => item.state)).toEqual([ProductState.REMOVED]);
    expect(removedResult.meta.total).toBe(1);
    expect(removedResult.stateCounts).toEqual({
      all: 3,
      active: 1,
      inactive: 0,
      draft: 1,
    });
  });

  async function seedProducts(em: EntityManager): Promise<void> {
    const user = em.create(UserEntity, {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'seller-product-query@example.com',
      displayName: 'Seller Product Query',
    });
    shop = em.create(ShopEntity, {
      id: '00000000-0000-4000-8000-000000000002',
      ownerUser: user,
      shopName: 'Seller Product Query Shop',
      slug: 'seller-product-query-shop',
      currency: 'USD',
    });
    category = em.create(CategoryEntity, {
      id: '00000000-0000-4000-8000-000000000003',
      name: 'Sewing',
      rank: 1,
    });
    const otherCategory = em.create(CategoryEntity, {
      id: '00000000-0000-4000-8000-000000000004',
      name: 'Other',
      rank: 2,
    });

    const activeProduct = makeProduct(em, {
      id: '00000000-0000-4000-8000-00000000000f',
      title: 'Needle Case',
      slug: 'needle-case',
      description: 'Felt organizer',
      state: ProductState.ACTIVE,
      category,
      updatedAt: new Date('2026-09-07T12:00:00.000Z'),
    });
    const draftProduct = makeProduct(em, {
      id: '00000000-0000-4000-8000-00000000000a',
      title: 'Thread Holder',
      slug: 'thread-holder',
      description: '100% cotton needle kit',
      state: ProductState.DRAFT,
      category,
      updatedAt: new Date('2026-09-07T12:00:00.000Z'),
    });
    makeProduct(em, {
      id: '00000000-0000-4000-8000-000000000005',
      title: 'Inactive Pin Cushion',
      slug: 'inactive-pin-cushion',
      description: 'Archived listing',
      state: ProductState.INACTIVE,
      category,
      updatedAt: new Date('2026-09-06T12:00:00.000Z'),
    });
    makeProduct(em, {
      id: '00000000-0000-4000-8000-000000000006',
      title: 'Unavailable Needle Kit',
      slug: 'unavailable-needle-kit',
      description: 'Temporarily paused',
      state: ProductState.UNAVAILABLE,
      category,
      updatedAt: new Date('2026-09-05T12:00:00.000Z'),
    });
    makeProduct(em, {
      id: '00000000-0000-4000-8000-000000000007',
      title: 'Removed Needle Kit',
      slug: 'removed-needle-kit',
      description: 'Removed listing',
      state: ProductState.REMOVED,
      category,
      updatedAt: new Date('2026-09-08T12:00:00.000Z'),
    });
    makeProduct(em, {
      id: '00000000-0000-4000-8000-000000000008',
      title: 'Needle From Other Category',
      slug: 'needle-other-category',
      description: 'Outside the selected category',
      state: ProductState.ACTIVE,
      category: otherCategory,
      updatedAt: new Date('2026-09-08T11:00:00.000Z'),
    });

    addHeavyRelations(em, activeProduct);
    addHeavyRelations(em, draftProduct);

    await em.persistAndFlush([user, shop, category, otherCategory]);
    em.clear();
  }

  function makeProduct(
    em: EntityManager,
    input: {
      id: string;
      title: string;
      slug: string;
      description: string;
      state: ProductState;
      category: CategoryEntity;
      updatedAt: Date;
    },
  ): ProductEntity {
    const product = em.create(ProductEntity, {
      id: input.id,
      shop,
      category: input.category,
      title: input.title,
      slug: input.slug,
      description: input.description,
      state: input.state,
      whoMade: ProductWhoMade.I_DID,
      isDigital: false,
      nonTaxable: false,
      tags: [],
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt,
    });
    em.persist(product);

    return product;
  }

  function addHeavyRelations(em: EntityManager, product: ProductEntity): void {
    const firstImage = em.create(ProductImageEntity, {
      product,
      storageKey: `products/${product.slug.replace('-case', '')}/main.jpg`,
      rank: 1,
    });
    const secondImage = em.create(ProductImageEntity, {
      product,
      storageKey: `products/${product.slug.replace('-case', '')}/side.jpg`,
      rank: 2,
    });
    const imageVariant = em.create(ProductImageVariantEntity, {
      image: firstImage,
      variant: ProductImageVariant.CARD_1X1,
      storageKey: `products/${product.slug}/card.webp`,
      width: 600,
      height: 600,
      format: 'webp',
    });
    const option = em.create(ProductOptionEntity, {
      product,
      name: 'Size',
      normalizedName: 'size',
      position: 1,
    });
    const smallValue = em.create(ProductOptionValueEntity, {
      productOption: option,
      value: 'Small',
      normalizedValue: 'small',
      position: 1,
    });
    const largeValue = em.create(ProductOptionValueEntity, {
      productOption: option,
      value: 'Large',
      normalizedValue: 'large',
      position: 2,
    });
    const smallVariant = em.create(ProductVariantEntity, {
      product,
      combinationKey: smallValue.id,
      rank: 1,
    });
    const largeVariant = em.create(ProductVariantEntity, {
      product,
      combinationKey: largeValue.id,
      rank: 2,
    });
    const smallSelection = em.create(ProductVariantOptionValueEntity, {
      product,
      productVariant: smallVariant,
      productOption: option,
      productOptionValue: smallValue,
    });
    const largeSelection = em.create(ProductVariantOptionValueEntity, {
      product,
      productVariant: largeVariant,
      productOption: option,
      productOptionValue: largeValue,
    });
    product.options.add(option);
    option.values.add(smallValue, largeValue);
    smallVariant.selections.add(smallSelection);
    largeVariant.selections.add(largeSelection);
    const smallInventory = em.create(ProductInventoryEntity, {
      shop,
      product,
      productVariant: smallVariant,
      sku: product.slug === 'needle-case' ? 'NEEDLE-S' : 'THREAD-S',
      stock: 4,
      onHandQuantity: 4,
      reservedQuantity: 0,
    });
    const largeInventory = em.create(ProductInventoryEntity, {
      shop,
      product,
      productVariant: largeVariant,
      sku: product.slug === 'needle-case' ? 'NEEDLE-L' : 'THREAD-L',
      stock: 6,
      onHandQuantity: 6,
      reservedQuantity: 0,
    });
    const smallPrice = em.create(VariantPriceEntity, {
      productInventory: smallInventory,
      currency: 'USD',
      amountMinor: 1200,
    });
    const largePrice = em.create(VariantPriceEntity, {
      productInventory: largeInventory,
      currency: 'USD',
      amountMinor: 1500,
    });
    const shipping = em.create(ProductShippingProfileEntity, {
      product,
      shop,
      originCountry: 'US',
      originZip: '10001',
      processTimeLabel: '1-3 business days',
    });
    const ground = em.create(ProductShippingDestinationEntity, {
      shippingProfile: shipping,
      countryCode: 'US',
      deliveryTimeLabel: '3-5 business days',
      service: 'USPS Ground',
      chargeType: ProductShippingCharge.FREE_SHIPPING,
      rank: 1,
    });
    const priority = em.create(ProductShippingDestinationEntity, {
      shippingProfile: shipping,
      countryCode: 'US',
      deliveryTimeLabel: '1-2 business days',
      service: 'USPS Priority',
      chargeType: ProductShippingCharge.FIXED_PRICE,
      rank: 2,
    });

    em.persist([
      firstImage,
      secondImage,
      imageVariant,
      option,
      smallValue,
      largeValue,
      smallSelection,
      largeSelection,
      smallVariant,
      largeVariant,
      smallInventory,
      largeInventory,
      smallPrice,
      largePrice,
      shipping,
      ground,
      priority,
    ]);
  }
});
