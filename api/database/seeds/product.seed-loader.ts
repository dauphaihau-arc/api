import { ProductVariantLifecycleState } from '~/domains/product/domain/enums/product-variant-lifecycle-state.enum';
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

export type ProductOptionSeed = {
  key: string;
  name: string;
  values: ProductOptionValueSeed[];
};

export type ProductOptionValueSeed = {
  key: string;
  value: string;
};

export type ProductSeed = {
  shopSlug: string;
  categoryPath: string[];
  title: string;
  description: string;
  whoMade: ProductWhoMade;
  isDigital: boolean;
  state: 'active' | 'draft' | 'inactive';
  options: ProductOptionSeed[];
  inventory: Array<{
    sku: string;
    stock: number;
    price: number;
    salePrice?: number;
    selections: Record<string, string>;
    variantState: ProductVariantLifecycleState;
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
  options_json: string;
  state: string;
};

type InventoryCsvRow = {
  product_title: string;
  shop_slug: string;
  sku: string;
  stock: string;
  price: string;
  sale_price: string;
  selections_json: string;
  variant_state: string;
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

function parseVariantState(value: string | undefined, inventoryKey: string): ProductVariantLifecycleState {
  const normalized = value?.trim() ?? '';

  if (normalized === '' || normalized === ProductVariantLifecycleState.ACTIVE) {
    return ProductVariantLifecycleState.ACTIVE;
  }
  if (normalized === ProductVariantLifecycleState.INACTIVE) {
    return ProductVariantLifecycleState.INACTIVE;
  }
  if (normalized === ProductVariantLifecycleState.REMOVED) {
    return ProductVariantLifecycleState.REMOVED;
  }

  throw new Error(`Invalid variant_state "${value}" for inventory seed ${inventoryKey}`);
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
  if (!Number.isFinite(parsed) || parsed < 0 || (fieldName === 'stock' && !Number.isSafeInteger(parsed))) {
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

function parseJsonCell<T>(value: string, fieldName: string, seedKey: string): T {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Missing ${fieldName} for seed ${seedKey}`);
  }

  try {
    return JSON.parse(trimmed) as T;
  }
  catch (error) {
    throw new Error(`Invalid ${fieldName} JSON for seed ${seedKey}: ${(error as Error).message}`);
  }
}

function validateSeedKey(value: unknown, fieldName: string, seedKey: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing ${fieldName} for seed ${seedKey}`);
  }

  const normalized = value.trim();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalized)) {
    throw new Error(`Invalid ${fieldName} "${value}" for seed ${seedKey}`);
  }

  return normalized;
}

function parseOptions(value: string, productKey: string): ProductOptionSeed[] {
  const rawOptions = parseJsonCell<unknown>(value, 'options_json', productKey);
  if (!Array.isArray(rawOptions)) {
    throw new Error(`options_json must be an array for product seed ${productKey}`);
  }

  const seenOptionKeys = new Set<string>();
  const seenOptionNames = new Set<string>();
  return rawOptions.map((rawOption, optionIndex) => {
    if (!rawOption || typeof rawOption !== 'object' || Array.isArray(rawOption)) {
      throw new Error(`Invalid option at index ${optionIndex} for product seed ${productKey}`);
    }

    const option = rawOption as Record<string, unknown>;
    const key = validateSeedKey(option.key, `options_json[${optionIndex}].key`, productKey);
    const name = typeof option.name === 'string' ? option.name.trim() : '';
    if (!name) {
      throw new Error(`Missing options_json[${optionIndex}].name for product seed ${productKey}`);
    }
    if (seenOptionKeys.has(key)) {
      throw new Error(`Duplicate option key "${key}" for product seed ${productKey}`);
    }
    seenOptionKeys.add(key);
    const normalizedName = name.toLowerCase();
    if (seenOptionNames.has(normalizedName)) {
      throw new Error(`Duplicate option name "${name}" for product seed ${productKey}`);
    }
    seenOptionNames.add(normalizedName);

    if (!Array.isArray(option.values) || option.values.length === 0) {
      throw new Error(`Option "${key}" must define values for product seed ${productKey}`);
    }

    const seenValueKeys = new Set<string>();
    const seenValueLabels = new Set<string>();
    const values = option.values.map((rawValue, valueIndex) => {
      if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
        throw new Error(`Invalid value at index ${valueIndex} for option "${key}" on product seed ${productKey}`);
      }
      const optionValue = rawValue as Record<string, unknown>;
      const valueKey = validateSeedKey(optionValue.key, `options_json[${optionIndex}].values[${valueIndex}].key`, productKey);
      const label = typeof optionValue.value === 'string' ? optionValue.value.trim() : '';
      if (!label) {
        throw new Error(`Missing value label for option "${key}" value "${valueKey}" on product seed ${productKey}`);
      }
      if (seenValueKeys.has(valueKey)) {
        throw new Error(`Duplicate value key "${valueKey}" for option "${key}" on product seed ${productKey}`);
      }
      seenValueKeys.add(valueKey);
      const normalizedLabel = label.toLowerCase();
      if (seenValueLabels.has(normalizedLabel)) {
        throw new Error(`Duplicate value label "${label}" for option "${key}" on product seed ${productKey}`);
      }
      seenValueLabels.add(normalizedLabel);

      return { key: valueKey, value: label };
    });

    return { key, name, values };
  });
}

function parseSelections(value: string, inventoryKey: string): Record<string, string> {
  const rawSelections = parseJsonCell<unknown>(value, 'selections_json', inventoryKey);
  if (!rawSelections || typeof rawSelections !== 'object' || Array.isArray(rawSelections)) {
    throw new Error(`selections_json must be an object for inventory seed ${inventoryKey}`);
  }

  return Object.fromEntries(
    Object.entries(rawSelections).map(([optionKey, valueKey]) => [
      validateSeedKey(optionKey, 'selection option key', inventoryKey),
      validateSeedKey(valueKey, `selection value for option "${optionKey}"`, inventoryKey),
    ]),
  );
}

function buildSelectionKey(selections: Record<string, string>): string {
  return Object.keys(selections)
    .sort()
    .map((optionKey) => `${optionKey}:${selections[optionKey]}`)
    .join('|') || '__default__';
}

function buildExpectedSelectionKeys(options: ProductOptionSeed[]): Set<string> {
  if (options.length === 0) {
    return new Set(['__default__']);
  }

  const keys = new Set<string>();
  const visit = (optionIndex: number, selections: Record<string, string>) => {
    if (optionIndex === options.length) {
      keys.add(buildSelectionKey(selections));
      return;
    }

    const option = options[optionIndex];
    for (const value of option.values) {
      visit(optionIndex + 1, { ...selections, [option.key]: value.key });
    }
  };
  visit(0, {});
  return keys;
}

function validateProductInventoryMatrix(productSeed: ProductSeed): void {
  const productKey = buildProductKey(productSeed.shopSlug, productSeed.title);
  const optionValueKeysByOptionKey = new Map(
    productSeed.options.map((option) => [
      option.key,
      new Set(option.values.map((value) => value.key)),
    ]),
  );
  const seenSelectionKeys = new Set<string>();
  const seenSkus = new Set<string>();

  if (productSeed.options.length === 0 && productSeed.inventory.length !== 1) {
    throw new Error(`Zero-option product seed ${productKey} must define exactly one default inventory row`);
  }

  for (const inventorySeed of productSeed.inventory) {
    const inventoryKey = `${productKey}::${inventorySeed.sku}`;
    if (!inventorySeed.sku.trim()) {
      throw new Error(`Missing sku for inventory seed ${inventoryKey}`);
    }
    if (seenSkus.has(inventorySeed.sku)) {
      throw new Error(`Duplicate sku "${inventorySeed.sku}" for product seed ${productKey}`);
    }
    seenSkus.add(inventorySeed.sku);

    const selectionEntries = Object.entries(inventorySeed.selections);
    const selectionKey = buildSelectionKey(inventorySeed.selections);
    if (productSeed.options.length === 0) {
      if (selectionEntries.length > 0) {
        throw new Error(`Default product seed ${productKey} cannot define selections`);
      }
      seenSelectionKeys.add(selectionKey);
      continue;
    }

    if (selectionEntries.length !== productSeed.options.length) {
      throw new Error(`Inventory seed ${inventoryKey} must select every product option`);
    }

    for (const option of productSeed.options) {
      const selectedValueKey = inventorySeed.selections[option.key];
      if (!selectedValueKey) {
        throw new Error(`Inventory seed ${inventoryKey} is missing option "${option.key}"`);
      }
      if (!optionValueKeysByOptionKey.get(option.key)?.has(selectedValueKey)) {
        throw new Error(`Inventory seed ${inventoryKey} selects unknown value "${selectedValueKey}" for option "${option.key}"`);
      }
    }

    for (const selectedOptionKey of Object.keys(inventorySeed.selections)) {
      if (!optionValueKeysByOptionKey.has(selectedOptionKey)) {
        throw new Error(`Inventory seed ${inventoryKey} selects unknown option "${selectedOptionKey}"`);
      }
    }


    if (seenSelectionKeys.has(selectionKey)) {
      throw new Error(`Duplicate option selection matrix row "${selectionKey}" for product seed ${productKey}`);
    }
    seenSelectionKeys.add(selectionKey);
  }

  const expectedSelectionKeys = buildExpectedSelectionKeys(productSeed.options);
  for (const expectedKey of expectedSelectionKeys) {
    if (!seenSelectionKeys.has(expectedKey)) {
      throw new Error(`Missing option selection matrix row "${expectedKey}" for product seed ${productKey}`);
    }
  }
  for (const actualKey of seenSelectionKeys) {
    if (!expectedSelectionKeys.has(actualKey)) {
      throw new Error(`Unexpected option selection matrix row "${actualKey}" for product seed ${productKey}`);
    }
  }
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
  const seenInventorySkus = new Set<string>();

  inventoryRows.forEach((row, index) => {
    const inventoryKey = `${row.shop_slug}::${row.product_title}#${index + 2}`;
    const productKey = buildProductKey(row.shop_slug, row.product_title);
    const inventory = inventoryByProductKey.get(productKey) ?? [];
    const sku = row.sku.trim();
    if (seenInventorySkus.has(`${row.shop_slug}::${sku}`)) {
      throw new Error(`Duplicate sku "${sku}" for shop seed ${row.shop_slug}`);
    }
    seenInventorySkus.add(`${row.shop_slug}::${sku}`);

    inventory.push({
      sku,
      stock: parseRequiredNumber(row.stock, 'stock', inventoryKey),
      price: parseRequiredNumber(row.price, 'price', inventoryKey),
      salePrice: parseOptionalNumber(row.sale_price, 'sale_price', inventoryKey),
      selections: parseSelections(row.selections_json, inventoryKey),
      variantState: parseVariantState(row.variant_state, inventoryKey),
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

  const seenProductKeys = new Set<string>();
  const seeds = productRows.map((row, index) => {
    const productKey = `${row.shop_slug}::${row.title}#${index + 2}`;
    const lookupKey = buildProductKey(row.shop_slug, row.title);
    const inventory = inventoryByProductKey.get(lookupKey);

    if (seenProductKeys.has(lookupKey)) {
      throw new Error(`Duplicate product seed ${lookupKey}`);
    }
    seenProductKeys.add(lookupKey);

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
      options: parseOptions(row.options_json, productKey),
      inventory,
      attributes: attributesByProductKey.get(lookupKey) ?? [],
    };
  });

  for (const productKey of inventoryByProductKey.keys()) {
    if (!seenProductKeys.has(productKey)) {
      throw new Error(`Inventory references missing product seed ${productKey}`);
    }
  }
  seeds.forEach(validateProductInventoryMatrix);
  return seeds;
}

export const productSeeds: ProductSeed[] = loadProductSeeds();
