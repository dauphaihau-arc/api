import { EntityManager } from '@mikro-orm/postgresql';
import { CategoryAttributeEntity } from '../../src/modules/domains/category/infra/persistence/entities/category-attribute.entity';
import { CategoryEntity } from '../../src/modules/domains/category/infra/persistence/entities/category.entity';
import { ProductState } from '../../src/modules/domains/product/domain/enums/product-state.enum';
import { ProductShippingCharge } from '../../src/modules/domains/product/domain/enums/product-shipping-charge.enum';
import { ProductVariantType } from '../../src/modules/domains/product/domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '../../src/modules/domains/product/domain/enums/product-who-made.enum';
import { ProductAttributeValueEntity } from '../../src/modules/domains/product/infra/persistence/entities/product-attribute-value.entity';
import { ProductImageEntity } from '../../src/modules/domains/product/infra/persistence/entities/product-image.entity';
import { ProductInventoryEntity } from '../../src/modules/domains/product/infra/persistence/entities/product-inventory.entity';
import { ProductShippingDestinationEntity } from '../../src/modules/domains/product/infra/persistence/entities/product-shipping-destination.entity';
import { ProductShippingProfileEntity } from '../../src/modules/domains/product/infra/persistence/entities/product-shipping-profile.entity';
import { ProductVariantEntity } from '../../src/modules/domains/product/infra/persistence/entities/product-variant.entity';
import { ProductEntity } from '../../src/modules/domains/product/infra/persistence/entities/product.entity';
import { ShopEntity } from '../../src/modules/domains/shop/infra/persistence/entities/shop.entity';

type ProductSeed = {
  shopName: string;
  categoryPath: string[];
  title: string;
  description: string;
  whoMade: ProductWhoMade;
  variantType: ProductVariantType;
  variantGroupName?: string;
  variantSubGroupName?: string;
  images: string[];
  inventory: Array<{
    sku: string;
    stock: number;
    price: number;
    salePrice?: number;
    optionValue1?: string;
    optionValue2?: string;
  }>;
};

const productSeeds: ProductSeed[] = [
  {
    shopName: 'Olive Atelier',
    categoryPath: ['Clothing', "Women's Fashion", 'Dresses'],
    title: 'Linen Weekend Dress',
    description:
      'Relaxed linen dress with a lightweight drape and clean everyday silhouette.',
    whoMade: ProductWhoMade.I_DID,
    variantType: ProductVariantType.SINGLE,
    variantGroupName: 'Color',
    images: [
      'shop/olive-atelier/linen-weekend-dress/1.jpg',
      'shop/olive-atelier/linen-weekend-dress/2.jpg',
    ],
    inventory: [
      { sku: 'OA-DRESS-BLK', stock: 14, price: 82, salePrice: 74, optionValue1: 'Black' },
      { sku: 'OA-DRESS-RED', stock: 9, price: 82, optionValue1: 'Red' },
    ],
  },
  {
    shopName: 'Olive Atelier',
    categoryPath: ['Accessories', 'Bag', 'Totes'],
    title: 'Canvas Market Tote',
    description:
      'Structured carryall with reinforced straps sized for a daily market run.',
    whoMade: ProductWhoMade.COLLECTIVE,
    variantType: ProductVariantType.NONE,
    images: [
      'shop/olive-atelier/canvas-market-tote/1.jpg',
      'shop/olive-atelier/canvas-market-tote/2.jpg',
    ],
    inventory: [{ sku: 'OA-TOTE-STD', stock: 21, price: 48 }],
  },
  {
    shopName: 'Reed Workshop',
    categoryPath: ['Clothing', 'Man Fashion', 'Hoodies'],
    title: 'Studio Pullover Hoodie',
    description:
      'Heavyweight hoodie built for cool mornings with a soft brushed interior.',
    whoMade: ProductWhoMade.I_DID,
    variantType: ProductVariantType.COMBINE,
    variantGroupName: 'Color',
    variantSubGroupName: 'Size',
    images: [
      'shop/reed-workshop/studio-pullover-hoodie/1.jpg',
      'shop/reed-workshop/studio-pullover-hoodie/2.jpg',
    ],
    inventory: [
      { sku: 'RW-HOOD-BLK-S', stock: 6, price: 68, optionValue1: 'Black', optionValue2: 'S' },
      { sku: 'RW-HOOD-BLK-M', stock: 8, price: 68, optionValue1: 'Black', optionValue2: 'M' },
      { sku: 'RW-HOOD-RED-S', stock: 4, price: 68, salePrice: 61, optionValue1: 'Red', optionValue2: 'S' },
      { sku: 'RW-HOOD-RED-M', stock: 7, price: 68, optionValue1: 'Red', optionValue2: 'M' },
    ],
  },
  {
    shopName: 'Reed Workshop',
    categoryPath: ['Electronics', 'Headphones'],
    title: 'Walnut Desk Headphones Stand',
    description:
      'Hand-finished wood display stand designed to keep over-ear headphones organized.',
    whoMade: ProductWhoMade.SOMEONE_ELSE,
    variantType: ProductVariantType.NONE,
    images: [
      'shop/reed-workshop/walnut-desk-headphones-stand/1.jpg',
      'shop/reed-workshop/walnut-desk-headphones-stand/2.jpg',
    ],
    inventory: [{ sku: 'RW-STAND-WAL', stock: 11, price: 36 }],
  },
  {
    shopName: 'Sage Studio',
    categoryPath: ['Art', 'Painting'],
    title: 'Minimal Horizon Print',
    description:
      'Archival print with a muted color palette and a wide matte-ready aspect ratio.',
    whoMade: ProductWhoMade.I_DID,
    variantType: ProductVariantType.NONE,
    images: [
      'shop/sage-studio/minimal-horizon-print/1.jpg',
      'shop/sage-studio/minimal-horizon-print/2.jpg',
    ],
    inventory: [{ sku: 'SS-PRINT-HZN', stock: 17, price: 54 }],
  },
  {
    shopName: 'Sage Studio',
    categoryPath: ['Home', 'Furniture', 'Table'],
    title: 'Oak Side Table',
    description:
      'Compact side table with rounded edges and a natural oil finish for small spaces.',
    whoMade: ProductWhoMade.COLLECTIVE,
    variantType: ProductVariantType.SINGLE,
    variantGroupName: 'Finish',
    images: [
      'shop/sage-studio/oak-side-table/1.jpg',
      'shop/sage-studio/oak-side-table/2.jpg',
    ],
    inventory: [
      { sku: 'SS-TABLE-OAK', stock: 3, price: 140, optionValue1: 'Oak' },
      { sku: 'SS-TABLE-WAL', stock: 2, price: 155, optionValue1: 'Walnut' },
    ],
  },
];

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

async function findCategoryByPath(em: EntityManager, path: string[]): Promise<CategoryEntity> {
  let parent: CategoryEntity | null = null;
  let category: CategoryEntity | null = null;

  for (const name of path) {
    category = await em.findOne(CategoryEntity, { name, parent: parent ?? null });
    if (!category) {
      throw new Error(`Missing seeded category path: ${path.join(' > ')}`);
    }
    parent = category;
  }

  if (!category) {
    throw new Error(`Missing seeded category path: ${path.join(' > ')}`);
  }

  return category;
}

async function syncProductImages(
  em: EntityManager,
  product: ProductEntity,
  images: string[]
): Promise<void> {
  for (const image of await em.find(ProductImageEntity, { product })) {
    em.remove(image);
  }
  await em.flush();

  images.forEach((storageKey, index) => {
    em.persist(em.create(ProductImageEntity, { product, storageKey, rank: index + 1 }));
  });
  await em.flush();
}

async function syncProductAttributes(
  em: EntityManager,
  product: ProductEntity,
  category: CategoryEntity
): Promise<void> {
  for (const value of await em.find(ProductAttributeValueEntity, { product })) {
    em.remove(value);
  }
  await em.flush();

  const attributes = await em.find(
    CategoryAttributeEntity,
    { category },
    { orderBy: { rank: 'asc' }, populate: ['options'] }
  );

  for (const [index, attribute] of attributes.entries()) {
    const options = attribute.options.getItems().sort((a, b) => a.rank - b.rank);
    const selectedOption = options[index % Math.max(options.length, 1)];
    em.persist(
      em.create(ProductAttributeValueEntity, {
        product,
        categoryAttribute: attribute,
        selectedOption,
      })
    );
  }

  await em.flush();
}

async function syncProductVariants(
  em: EntityManager,
  product: ProductEntity,
  variantType: ProductVariantType,
  inventorySeeds: ProductSeed['inventory']
): Promise<Map<string, ProductVariantEntity>> {
  for (const variant of await em.find(ProductVariantEntity, { product })) {
    em.remove(variant);
  }
  await em.flush();

  const variantsByKey = new Map<string, ProductVariantEntity>();
  if (variantType === ProductVariantType.NONE) {
    return variantsByKey;
  }

  const seenKeys = new Set<string>();
  inventorySeeds.forEach((inventorySeed, index) => {
    const key =
      variantType === ProductVariantType.COMBINE
        ? `${inventorySeed.optionValue1 ?? ''}::${inventorySeed.optionValue2 ?? ''}`
        : `${inventorySeed.optionValue1 ?? ''}`;

    if (seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    const variant = em.create(ProductVariantEntity, {
      product,
      name:
        variantType === ProductVariantType.COMBINE
          ? `${inventorySeed.optionValue1} / ${inventorySeed.optionValue2}`
          : (inventorySeed.optionValue1 ?? 'Default'),
      optionValue1: inventorySeed.optionValue1,
      optionValue2: inventorySeed.optionValue2,
      rank: index + 1,
    });

    variantsByKey.set(key, variant);
    em.persist(variant);
  });

  await em.flush();
  return variantsByKey;
}

async function syncProductInventory(
  em: EntityManager,
  product: ProductEntity,
  shop: ShopEntity,
  variantType: ProductVariantType,
  inventorySeeds: ProductSeed['inventory'],
  variantsByKey: Map<string, ProductVariantEntity>
): Promise<void> {
  for (const inventory of await em.find(ProductInventoryEntity, { product })) {
    em.remove(inventory);
  }
  await em.flush();

  inventorySeeds.forEach((inventorySeed) => {
    const variantKey =
      variantType === ProductVariantType.NONE
        ? undefined
        : variantType === ProductVariantType.COMBINE
          ? `${inventorySeed.optionValue1 ?? ''}::${inventorySeed.optionValue2 ?? ''}`
          : `${inventorySeed.optionValue1 ?? ''}`;

    em.persist(
      em.create(ProductInventoryEntity, {
        shop,
        product,
        productVariant: variantKey ? variantsByKey.get(variantKey) : undefined,
        sku: inventorySeed.sku,
        stock: inventorySeed.stock,
        price: inventorySeed.price,
        salePrice: inventorySeed.salePrice,
      })
    );
  });

  await em.flush();
}

async function syncProductShipping(
  em: EntityManager,
  product: ProductEntity,
  shop: ShopEntity
): Promise<void> {
  const profiles = await em.find(
    ProductShippingProfileEntity,
    { product },
    { populate: ['destinations'] }
  );

  for (const profile of profiles) {
    for (const destination of profile.destinations.getItems()) {
      em.remove(destination);
    }
    em.remove(profile);
  }
  await em.flush();

  const shippingProfile = em.create(ProductShippingProfileEntity, {
    product,
    shop,
    originCountry: 'US',
    originZip: '27006',
    processTimeLabel: '1 business day',
  });
  em.persist(shippingProfile);
  await em.flush();

  em.persist(
    em.create(ProductShippingDestinationEntity, {
      shippingProfile,
      countryCode: 'US',
      deliveryTimeLabel: '1-3 business days',
      service: 'standard',
      chargeType: ProductShippingCharge.FREE_SHIPPING,
      rank: 1,
    })
  );
  await em.flush();
}

export async function seedProducts(
  em: EntityManager,
  shopsByName: Map<string, ShopEntity>
): Promise<void> {
  for (const productSeed of productSeeds) {
    const shop = shopsByName.get(productSeed.shopName);
    if (!shop) {
      throw new Error(`Missing seeded shop: ${productSeed.shopName}`);
    }

    const category = await findCategoryByPath(em, productSeed.categoryPath);
    const slug = slugify(productSeed.title);
    const product =
      (await em.findOne(ProductEntity, { shop, slug })) ??
      em.create(ProductEntity, {
        shop,
        slug,
        title: productSeed.title,
        description: productSeed.description,
        state: ProductState.ACTIVE,
        whoMade: productSeed.whoMade,
        isDigital: false,
        nonTaxable: false,
        views: 0,
        ratingAverage: 0,
      });

    product.category = category;
    product.title = productSeed.title;
    product.description = productSeed.description;
    product.state = ProductState.ACTIVE;
    product.whoMade = productSeed.whoMade;
    product.variantType = productSeed.variantType;
    product.variantGroupName = productSeed.variantGroupName;
    product.variantSubGroupName = productSeed.variantSubGroupName;
    product.publishedAt = new Date();
    product.views = 0;
    product.ratingAverage = 0;
    em.persist(product);
    await em.flush();

    await syncProductImages(em, product, productSeed.images);
    await syncProductAttributes(em, product, category);
    const variantsByKey = await syncProductVariants(
      em,
      product,
      productSeed.variantType,
      productSeed.inventory
    );
    await syncProductInventory(
      em,
      product,
      shop,
      productSeed.variantType,
      productSeed.inventory,
      variantsByKey
    );
    await syncProductShipping(em, product, shop);
  }
}
