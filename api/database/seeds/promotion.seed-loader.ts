import * as path from 'node:path';
import ms, { type StringValue } from 'ms';
import {
  MARKETPLACE_CURRENCIES,
  type MarketplaceCurrency,
} from '~/platform/config/marketplace.config';
import { PromotionApplicationKind } from '~/domains/promotion/domain/enums/promotion-application-kind.enum';
import { PromotionBenefitType } from '~/domains/promotion/domain/enums/promotion-benefit-type.enum';
import { PromotionMinOrderType } from '~/domains/promotion/domain/enums/promotion-min-order-type.enum';
import { PromotionProductScope } from '~/domains/promotion/domain/enums/promotion-product-scope.enum';
import { PromotionVisibility } from '~/domains/promotion/domain/enums/promotion-visibility.enum';
import { readTsvRows } from './shared/read-tsv-rows';

export type PromotionSeed = {
  shopSlug: string;
  /**
   * Ordinary internal name. The seed data reuses the former code text so a
   * Promotion stays identifiable in a dev database; names are not unique in
   * production and carry no redemption meaning.
   */
  name: string;
  applicationKind: PromotionApplicationKind;
  /** Present for a Checkout Discount; absent for a Sale. */
  code?: string;
  benefitType: PromotionBenefitType;
  currency: MarketplaceCurrency;
  productScope: PromotionProductScope;
  amountOff?: number;
  percentOff?: number;
  maxRedemptions?: number;
  maxRedemptionsPerBuyer?: number;
  minOrderType: PromotionMinOrderType;
  minOrderValue?: number;
  minPurchaseQuantity?: number;
  visibility?: PromotionVisibility;
  timezone: string;
  startAt: string;
  endAt: string;
  appliesProductTitles?: string[];
};

type PromotionRow = {
  shop_slug: string;
  name: string;
  application_kind: string;
  code: string;
  benefit_type: string;
  currency: string;
  product_scope: string;
  amount_off: string;
  percent_off: string;
  max_redemptions: string;
  max_redemptions_per_buyer: string;
  min_order_type: string;
  min_order_value: string;
  min_purchase_quantity: string;
  visibility: string;
  timezone: string;
  period: string;
  start_date: string;
  end_date: string;
};

type PromotionProductRow = {
  shop_slug: string;
  promotion_name: string;
  product_title: string;
};

const PROMOTIONS_TSV_PATH = path.resolve(__dirname, '../../../seed-data/promotions.tsv');
const PROMOTION_PRODUCTS_TSV_PATH = path.resolve(
  __dirname,
  '../../../seed-data/promotion-products.tsv',
);

function parseOptionalNumber(value: string, fieldName: string, promotionKey: string): number | undefined {
  if (value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${fieldName} "${value}" for promotion seed ${promotionKey}`);
  }

  return parsed;
}

function parseCurrency(value: string, promotionKey: string): MarketplaceCurrency {
  const normalized = value.trim().toUpperCase();

  if (!(MARKETPLACE_CURRENCIES as readonly string[]).includes(normalized)) {
    throw new Error(`Invalid currency "${value}" for promotion seed ${promotionKey}`);
  }

  return normalized as MarketplaceCurrency;
}

function parseApplicationKind(value: string, promotionKey: string): PromotionApplicationKind {
  if (
    value !== PromotionApplicationKind.SALE
    && value !== PromotionApplicationKind.CHECKOUT_DISCOUNT
  ) {
    throw new Error(`Invalid application_kind "${value}" for promotion seed ${promotionKey}`);
  }

  return value;
}

function parseBenefitType(value: string, promotionKey: string): PromotionBenefitType {
  if (
    value === PromotionBenefitType.PERCENTAGE
    || value === PromotionBenefitType.FIXED_AMOUNT
    || value === PromotionBenefitType.FREE_SHIPPING
  ) {
    return value;
  }

  throw new Error(`Invalid benefit_type "${value}" for promotion seed ${promotionKey}`);
}

function parseProductScope(value: string, promotionKey: string): PromotionProductScope {
  if (value === PromotionProductScope.ALL || value === PromotionProductScope.SPECIFIC) {
    return value;
  }

  throw new Error(`Invalid product_scope "${value}" for promotion seed ${promotionKey}`);
}

function parseVisibility(value: string, promotionKey: string): PromotionVisibility | undefined {
  if (value.trim() === '') {
    return undefined;
  }
  if (value === PromotionVisibility.PUBLIC || value === PromotionVisibility.CODE_ONLY) {
    return value;
  }

  throw new Error(`Invalid visibility "${value}" for promotion seed ${promotionKey}`);
}

function parseMinOrderType(value: string, promotionKey: string): PromotionMinOrderType {
  if (value.trim() === '') {
    return PromotionMinOrderType.NONE;
  }
  if (
    value === PromotionMinOrderType.NONE
    || value === PromotionMinOrderType.ORDER_TOTAL
    || value === PromotionMinOrderType.PURCHASE_QUANTITY
  ) {
    return value;
  }

  throw new Error(`Invalid min_order_type "${value}" for promotion seed ${promotionKey}`);
}

function resolvePeriodDate(seededAt: Date, value: string, promotionKey: string): Date {
  const normalized = value.trim().toLowerCase();

  if (normalized === 'now') {
    return new Date(seededAt);
  }

  const calendarMatch = /^(\d+)\s*(mo|month|months|y|year|years)$/.exec(normalized);

  if (calendarMatch) {
    const amount = Number(calendarMatch[1]);
    const unit = calendarMatch[2];
    const resolved = new Date(seededAt);

    if (unit === 'mo' || unit === 'month' || unit === 'months') {
      resolved.setMonth(resolved.getMonth() + amount);
      return resolved;
    }

    resolved.setFullYear(resolved.getFullYear() + amount);
    return resolved;
  }

  const parsed = ms(normalized as StringValue);
  if (parsed === undefined) {
    throw new Error(`Invalid period offset "${value}" for promotion seed ${promotionKey}`);
  }

  return new Date(seededAt.getTime() + parsed);
}

function resolvePromotionWindow(
  row: PromotionRow,
  promotionKey: string,
): { startAt: string; endAt: string } {
  const period = row.period.trim();
  const startDate = row.start_date.trim();
  const endDate = row.end_date.trim();

  if (!period) {
    if (!startDate || !endDate) {
      throw new Error(
        `Promotion seed ${promotionKey} must define either period or both start_date and end_date`,
      );
    }

    return { startAt: startDate, endAt: endDate };
  }

  if (startDate || endDate) {
    throw new Error(
      `Promotion seed ${promotionKey} cannot define period together with start_date or end_date`,
    );
  }

  const [startOffsetRaw, endOffsetRaw, extraSegment] = period.split('..');
  if (!startOffsetRaw || !endOffsetRaw || extraSegment !== undefined) {
    throw new Error(
      `Invalid period "${period}" for promotion seed ${promotionKey}; expected <start>..<end>`,
    );
  }

  const seededAt = new Date();
  const resolvedStart = resolvePeriodDate(seededAt, startOffsetRaw, promotionKey);
  const resolvedEnd = resolvePeriodDate(seededAt, endOffsetRaw, promotionKey);

  if (resolvedEnd <= resolvedStart) {
    throw new Error(`Promotion seed ${promotionKey} must resolve to end_at after start_at`);
  }

  return { startAt: resolvedStart.toISOString(), endAt: resolvedEnd.toISOString() };
}

function loadPromotionSeeds(): PromotionSeed[] {
  const promotionRows = readTsvRows<PromotionRow>(PROMOTIONS_TSV_PATH);
  const promotionProductRows = readTsvRows<PromotionProductRow>(PROMOTION_PRODUCTS_TSV_PATH);
  const productTitlesByKey = new Map<string, string[]>();

  promotionProductRows.forEach((row, index) => {
    const relationKey = `${row.shop_slug}::${row.promotion_name}#${index + 2}`;
    const key = `${row.shop_slug.trim()}::${row.promotion_name.trim()}`;
    const titles = productTitlesByKey.get(key) ?? [];

    if (!row.product_title.trim()) {
      throw new Error(`Missing product_title for promotion-product seed ${relationKey}`);
    }

    titles.push(row.product_title.trim());
    productTitlesByKey.set(key, titles);
  });

  return promotionRows.map((row, index) => {
    const promotionKey = `${row.shop_slug}::${row.name}#${index + 2}`;
    const key = `${row.shop_slug.trim()}::${row.name.trim()}`;
    const window = resolvePromotionWindow(row, promotionKey);
    const code = row.code.trim();
    const applicationKind = parseApplicationKind(row.application_kind.trim(), promotionKey);

    if (applicationKind === PromotionApplicationKind.SALE && code) {
      throw new Error(`Sale promotion seed ${promotionKey} must not define a code`);
    }
    if (applicationKind === PromotionApplicationKind.CHECKOUT_DISCOUNT && !code) {
      throw new Error(`Checkout discount promotion seed ${promotionKey} must define a code`);
    }

    return {
      shopSlug: row.shop_slug.trim(),
      name: row.name.trim(),
      applicationKind,
      ...(code ? { code } : {}),
      benefitType: parseBenefitType(row.benefit_type.trim(), promotionKey),
      currency: parseCurrency(row.currency, promotionKey),
      productScope: parseProductScope(row.product_scope.trim(), promotionKey),
      ...(parseOptionalNumber(row.amount_off, 'amount_off', promotionKey) !== undefined
        ? { amountOff: parseOptionalNumber(row.amount_off, 'amount_off', promotionKey) }
        : {}),
      ...(parseOptionalNumber(row.percent_off, 'percent_off', promotionKey) !== undefined
        ? { percentOff: parseOptionalNumber(row.percent_off, 'percent_off', promotionKey) }
        : {}),
      ...(parseOptionalNumber(row.max_redemptions, 'max_redemptions', promotionKey) !== undefined
        ? { maxRedemptions: parseOptionalNumber(row.max_redemptions, 'max_redemptions', promotionKey) }
        : {}),
      ...(parseOptionalNumber(row.max_redemptions_per_buyer, 'max_redemptions_per_buyer', promotionKey) !== undefined
        ? {
          maxRedemptionsPerBuyer: parseOptionalNumber(
            row.max_redemptions_per_buyer,
            'max_redemptions_per_buyer',
            promotionKey,
          ),
        }
        : {}),
      minOrderType: parseMinOrderType(row.min_order_type.trim(), promotionKey),
      ...(parseOptionalNumber(row.min_order_value, 'min_order_value', promotionKey) !== undefined
        ? { minOrderValue: parseOptionalNumber(row.min_order_value, 'min_order_value', promotionKey) }
        : {}),
      ...(parseOptionalNumber(row.min_purchase_quantity, 'min_purchase_quantity', promotionKey) !== undefined
        ? {
          minPurchaseQuantity: parseOptionalNumber(
            row.min_purchase_quantity,
            'min_purchase_quantity',
            promotionKey,
          ),
        }
        : {}),
      ...(parseVisibility(row.visibility, promotionKey) !== undefined
        ? { visibility: parseVisibility(row.visibility, promotionKey) }
        : {}),
      timezone: row.timezone.trim(),
      startAt: window.startAt,
      endAt: window.endAt,
      appliesProductTitles: productTitlesByKey.get(key),
    };
  });
}

export const promotionSeeds: PromotionSeed[] = loadPromotionSeeds();
