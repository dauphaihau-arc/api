import { ProductVariantType } from '~/domains/product/domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';
import {
  PRODUCT_ATTRIBUTES_LOCAL_TSV_PATH,
  PRODUCT_ATTRIBUTES_TSV_PATH,
  PRODUCT_INVENTORY_LOCAL_TSV_PATH,
  PRODUCT_INVENTORY_TSV_PATH,
  PRODUCT_LOCAL_TSV_PATH,
  PRODUCT_TSV_PATH,
} from './product-seed-paths';
import { readOptionalTsvRows, readTsvRows } from './shared/read-tsv-rows';

export type ProductSeed = {
  shopSlug: string;
  categoryPath: string[];
  title: string;
  description: string;
  whoMade: ProductWhoMade;
  isDigital: boolean;
  state: 'active' | 'draft' | 'inactive';
  variantType: ProductVariantType;
  variantGroupName?: string;
  variantSubGroupName?: string;
  inventory: Array<{
    sku: string;
    stock: number;
    price: number;
    salePrice?: number;
    optionValue1?: string;
    optionValue2?: string;
  }>;
  attributes: Array<{
    attributeKey: string;
    optionValue: string;
  }>;
};

type ProductCsvRow = {
  shop_slug: string;
  category_path: string;
  title: string;
  description: string;
  who_made: string;
  is_digital?: string;
  state: string;
  variant_type: string;
  variant_group_name: string;
  variant_sub_group_name: string;
};

type InventoryCsvRow = {
  product_title: string;
  shop_slug: string;
  sku: string;
  stock: string;
  price: string;
  sale_price: string;
  option_value_1: string;
  option_value_2: string;
};

type ProductAttributeCsvRow = {
  product_title: string;
  shop_slug: string;
  attribute_key: string;
  option_value: string;
};

function parseCategoryPath(value: string, productKey: string): string[] {
  const categoryPath = value
    .split('>')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (categoryPath.length === 0) {
    throw new Error(`Missing category_path for product seed ${productKey}`);
  }

  return categoryPath;
}

function parseWhoMade(value: string, productKey: string): ProductWhoMade {
  if (value === ProductWhoMade.I_DID) {
    return ProductWhoMade.I_DID;
  }
  if (value === ProductWhoMade.COLLECTIVE) {
    return ProductWhoMade.COLLECTIVE;
  }
  if (value === ProductWhoMade.SOMEONE_ELSE) {
    return ProductWhoMade.SOMEONE_ELSE;
  }

  throw new Error(`Invalid who_made "${value}" for product seed ${productKey}`);
}

function parseVariantType(value: string, productKey: string): ProductVariantType {
  if (value === ProductVariantType.NONE) {
    return ProductVariantType.NONE;
  }
  if (value === ProductVariantType.SINGLE) {
    return ProductVariantType.SINGLE;
  }
  if (value === ProductVariantType.COMBINE) {
    return ProductVariantType.COMBINE;
  }

  throw new Error(`Invalid variant_type "${value}" for product seed ${productKey}`);
}

function parseState(
  value: string | undefined,
  productKey: string,
): ProductSeed['state'] {
  const normalized = value?.trim() ?? '';

  if (normalized === '' || normalized === 'active') {
    return 'active';
  }

  if (normalized === 'draft') {
    return 'draft';
  }

  if (normalized === 'inactive') {
    return 'inactive';
  }

  throw new Error(`Invalid state "${value}" for product seed ${productKey}`);
}

function parseIsDigital(
  value: string | undefined,
  productKey: string,
): boolean {
  const normalized = value?.trim().toLowerCase() ?? '';

  if (normalized === '' || normalized === 'false') {
    return false;
  }

  if (normalized === 'true') {
    return true;
  }

  throw new Error(`Invalid is_digital "${value}" for product seed ${productKey}`);
}

function parseOptionalNumber(
  value: string,
  fieldName: string,
  inventoryKey: string,
): number | undefined {
  if (value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${fieldName} "${value}" for inventory seed ${inventoryKey}`);
  }

  return parsed;
}

function parseRequiredNumber(value: string, fieldName: string, inventoryKey: string): number {
  const parsed = parseOptionalNumber(value, fieldName, inventoryKey);
  if (parsed === undefined) {
    throw new Error(`Missing ${fieldName} for inventory seed ${inventoryKey}`);
  }
  return parsed;
}

function buildProductKey(shopSlug: string, title: string): string {
  return `${shopSlug}::${title}`;
}

function loadProductSeeds(): ProductSeed[] {
  const productRows = [
    ...readTsvRows<ProductCsvRow>(PRODUCT_TSV_PATH),
    ...readOptionalTsvRows<ProductCsvRow>(PRODUCT_LOCAL_TSV_PATH),
  ];
  const inventoryRows = [
    ...readTsvRows<InventoryCsvRow>(PRODUCT_INVENTORY_TSV_PATH),
    ...readOptionalTsvRows<InventoryCsvRow>(PRODUCT_INVENTORY_LOCAL_TSV_PATH),
  ];
  const attributeRows = [
    ...readTsvRows<ProductAttributeCsvRow>(PRODUCT_ATTRIBUTES_TSV_PATH),
    ...readOptionalTsvRows<ProductAttributeCsvRow>(PRODUCT_ATTRIBUTES_LOCAL_TSV_PATH),
  ];

  const inventoryByProductKey = new Map<ProductSeed['shopSlug'], ProductSeed['inventory']>();
  const attributesByProductKey = new Map<ProductSeed['shopSlug'], ProductSeed['attributes']>();

  inventoryRows.forEach((row, index) => {
    const inventoryKey = `${row.shop_slug}::${row.product_title}#${index + 2}`;
    const productKey = buildProductKey(row.shop_slug, row.product_title);
    const inventory = inventoryByProductKey.get(productKey) ?? [];

    inventory.push({
      sku: row.sku,
      stock: parseRequiredNumber(row.stock, 'stock', inventoryKey),
      price: parseRequiredNumber(row.price, 'price', inventoryKey),
      salePrice: parseOptionalNumber(row.sale_price, 'sale_price', inventoryKey),
      optionValue1: row.option_value_1.trim() || undefined,
      optionValue2: row.option_value_2.trim() || undefined,
    });

    inventoryByProductKey.set(productKey, inventory);
  });

  attributeRows.forEach((row, index) => {
    const attributeSeedKey = `${row.shop_slug}::${row.product_title}#${index + 2}`;
    const productKey = buildProductKey(row.shop_slug, row.product_title);
    const attributeKey = row.attribute_key.trim();
    const optionValue = row.option_value.trim();

    if (!attributeKey || !optionValue) {
      throw new Error(
        `Missing attribute_key or option_value for product attribute seed ${attributeSeedKey}`,
      );
    }

    const attributes = attributesByProductKey.get(productKey) ?? [];
    attributes.push({
      attributeKey,
      optionValue,
    });
    attributesByProductKey.set(productKey, attributes);
  });

  return productRows.map((row, index) => {
    const productKey = `${row.shop_slug}::${row.title}#${index + 2}`;
    const lookupKey = buildProductKey(row.shop_slug, row.title);
    const inventory = inventoryByProductKey.get(lookupKey);

    if (!inventory || inventory.length === 0) {
      throw new Error(`Missing inventory rows for product seed ${productKey}`);
    }

    return {
      shopSlug: row.shop_slug.trim(),
      categoryPath: parseCategoryPath(row.category_path, productKey),
      title: row.title,
      description: row.description,
      whoMade: parseWhoMade(row.who_made, productKey),
      isDigital: parseIsDigital(row.is_digital, productKey),
      state: parseState(row.state, productKey),
      variantType: parseVariantType(row.variant_type, productKey),
      variantGroupName: row.variant_group_name.trim() || undefined,
      variantSubGroupName: row.variant_sub_group_name.trim() || undefined,
      inventory,
      attributes: attributesByProductKey.get(lookupKey) ?? [],
    };
  });
}

export const productSeeds: ProductSeed[] = loadProductSeeds();
