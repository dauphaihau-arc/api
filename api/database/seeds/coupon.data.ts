import * as path from 'node:path';
import { CouponAppliesTo } from '../../src/modules/domains/coupon/domain/enums/coupon-applies-to.enum';
import { CouponMinOrderType } from '../../src/modules/domains/coupon/domain/enums/coupon-min-order-type.enum';
import { CouponType } from '../../src/modules/domains/coupon/domain/enums/coupon-type.enum';
import { readTsvRows } from './shared/read-tsv-rows';

export type CouponSeed = {
  shopSlug: string;
  code: string;
  type: CouponType;
  appliesTo: CouponAppliesTo;
  appliesProductTitles?: string[];
  amountOff?: number;
  percentOff?: number;
  maxUses: number;
  maxUsesPerUser: number;
  minOrderType: CouponMinOrderType;
  minOrderValue?: number;
  minProducts?: number;
  isActive: boolean;
  isAutoSale: boolean;
  startDate: string;
  endDate: string;
};

type CouponRow = {
  shop_slug: string;
  code: string;
  type: string;
  applies_to: string;
  amount_off: string;
  percent_off: string;
  max_uses: string;
  max_uses_per_user: string;
  min_order_type: string;
  min_order_value: string;
  min_products: string;
  is_active: string;
  is_auto_sale: string;
  start_date: string;
  end_date: string;
};

type CouponProductRow = {
  coupon_code: string;
  shop_slug: string;
  product_title: string;
};

const COUPONS_TSV_PATH = path.resolve(__dirname, '../../../seed-data/coupons.tsv');
const COUPON_PRODUCTS_TSV_PATH = path.resolve(
  __dirname,
  '../../../seed-data/coupon-products.tsv'
);

function parseOptionalNumber(value: string, fieldName: string, couponKey: string): number | undefined {
  if (value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${fieldName} "${value}" for coupon seed ${couponKey}`);
  }

  return parsed;
}

function parseRequiredNumber(value: string, fieldName: string, couponKey: string): number {
  const parsed = parseOptionalNumber(value, fieldName, couponKey);
  if (parsed === undefined) {
    throw new Error(`Missing ${fieldName} for coupon seed ${couponKey}`);
  }
  return parsed;
}

function parseBoolean(value: string, fieldName: string, couponKey: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }

  throw new Error(`Invalid ${fieldName} "${value}" for coupon seed ${couponKey}`);
}

function parseCouponType(value: string, couponKey: string): CouponType {
  if (value === CouponType.FIXED_AMOUNT) {
    return CouponType.FIXED_AMOUNT;
  }
  if (value === CouponType.PERCENTAGE) {
    return CouponType.PERCENTAGE;
  }
  if (value === CouponType.FREE_SHIP) {
    return CouponType.FREE_SHIP;
  }

  throw new Error(`Invalid type "${value}" for coupon seed ${couponKey}`);
}

function parseCouponAppliesTo(value: string, couponKey: string): CouponAppliesTo {
  if (value === CouponAppliesTo.ALL) {
    return CouponAppliesTo.ALL;
  }
  if (value === CouponAppliesTo.SPECIFIC) {
    return CouponAppliesTo.SPECIFIC;
  }

  throw new Error(`Invalid applies_to "${value}" for coupon seed ${couponKey}`);
}

function parseMinOrderType(value: string, couponKey: string): CouponMinOrderType {
  if (value === CouponMinOrderType.NONE) {
    return CouponMinOrderType.NONE;
  }
  if (value === CouponMinOrderType.ORDER_TOTAL) {
    return CouponMinOrderType.ORDER_TOTAL;
  }
  if (value === CouponMinOrderType.NUMBER_OF_PRODUCTS) {
    return CouponMinOrderType.NUMBER_OF_PRODUCTS;
  }

  throw new Error(`Invalid min_order_type "${value}" for coupon seed ${couponKey}`);
}

function buildCouponKey(shopSlug: string, code: string): string {
  return `${shopSlug}::${code}`;
}

function loadCouponSeeds(): CouponSeed[] {
  const couponRows = readTsvRows<CouponRow>(COUPONS_TSV_PATH);
  const couponProductRows = readTsvRows<CouponProductRow>(COUPON_PRODUCTS_TSV_PATH);
  const productTitlesByCouponKey = new Map<string, string[]>();

  couponProductRows.forEach((row, index) => {
    const relationKey = `${row.shop_slug}::${row.coupon_code}#${index + 2}`;
    const couponKey = buildCouponKey(row.shop_slug.trim(), row.coupon_code.trim());
    const titles = productTitlesByCouponKey.get(couponKey) ?? [];

    if (!row.product_title.trim()) {
      throw new Error(`Missing product_title for coupon-product seed ${relationKey}`);
    }

    titles.push(row.product_title.trim());
    productTitlesByCouponKey.set(couponKey, titles);
  });

  return couponRows.map((row, index) => {
    const couponKey = `${row.shop_slug}::${row.code}#${index + 2}`;
    const lookupKey = buildCouponKey(row.shop_slug.trim(), row.code.trim());

    return {
      shopSlug: row.shop_slug.trim(),
      code: row.code.trim(),
      type: parseCouponType(row.type.trim(), couponKey),
      appliesTo: parseCouponAppliesTo(row.applies_to.trim(), couponKey),
      appliesProductTitles: productTitlesByCouponKey.get(lookupKey),
      amountOff: parseOptionalNumber(row.amount_off, 'amount_off', couponKey),
      percentOff: parseOptionalNumber(row.percent_off, 'percent_off', couponKey),
      maxUses: parseRequiredNumber(row.max_uses, 'max_uses', couponKey),
      maxUsesPerUser: parseRequiredNumber(row.max_uses_per_user, 'max_uses_per_user', couponKey),
      minOrderType: parseMinOrderType(row.min_order_type.trim(), couponKey),
      minOrderValue: parseOptionalNumber(row.min_order_value, 'min_order_value', couponKey),
      minProducts: parseOptionalNumber(row.min_products, 'min_products', couponKey),
      isActive: parseBoolean(row.is_active, 'is_active', couponKey),
      isAutoSale: parseBoolean(row.is_auto_sale, 'is_auto_sale', couponKey),
      startDate: row.start_date.trim(),
      endDate: row.end_date.trim(),
    };
  });
}

export const couponSeeds: CouponSeed[] = loadCouponSeeds();
