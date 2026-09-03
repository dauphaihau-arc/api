import { CartKind } from '../domain/enums/cart-kind.enum';
import { toMinorUnits } from '~/platform/utils/money';

export interface CartPricingSnapshot {
  amountMinor: number;
  originalAmountMinor?: number;
  currency: string;
  sourceCurrency: string;
  sourceUnitAmountMinor: number;
  sourcePriceId?: string;
  sourceType?: 'market_override' | 'base_native' | 'base_fx';
  marketCode?: string;
  fxRate?: string;
  fxSource?: string;
  fxEffectiveAt?: Date;
  fxSourceTimestamp?: Date;
}

export type CartOwnerType = 'guest' | 'user';

export type CartActor =
  | { type: 'user'; userId: string }
  | { type: 'guest'; guestSessionId: string };

export interface CartInventoryCandidate {
  inventoryId: string;
  productId: string;
  productSlug: string;
  shopId: string;
  shopName: string;
  shopSlug: string;
  title: string;
  variantType: string;
  variantGroupName?: string;
  variantSubGroupName?: string;
  imageUrl?: string;
  thumbnailImageUrl?: string;
  variantName?: string;
  stock: number;
  sku?: string;
  productState: string;
}

export interface CartInventorySnapshot extends CartInventoryCandidate {
  currency: string;
  pricing: CartPricingSnapshot;
}

export interface CartItemSnapshot {
  id: string;
  quantity: number;
  isSelectOrder: boolean;
  updatedAt: Date;
  inventory: CartInventorySnapshot;
}

export interface CartSnapshot {
  id: string;
  userId: string | null;
  guestSessionId: string | null;
  kind: CartKind;
  items: CartItemSnapshot[];
}

export interface CartProductItemResponse {
  id: string;
  quantity: number;
  is_selected: boolean;
  unit_price_minor: number;
  product: {
    id: string;
    slug: string;
    shop: {
      slug: string;
    };
    title: string;
    variant_type: string;
    variant_group_name?: string;
    variant_sub_group_name?: string;
    image_url?: string;
  };
  inventory: {
    id: string;
    amount_minor: number;
    original_amount_minor?: number;
    currency: string;
    stock: number;
    sku?: string;
    variant_name?: string;
  };
}

export interface CartShopGroupResponse {
  shop: {
    id: string;
    name: string;
  };
  items: CartProductItemResponse[];
  currency: string;
  total_minor: number;
  shipping_minor: number;
}

export interface CartResponse {
  cart: {
    id: string;
    user_id: string;
    is_temp: boolean;
    shop_groups: CartShopGroupResponse[];
    recent_items: Array<{
      item_id: string;
      product: {
        id: string;
        slug: string;
        shop: {
          slug: string;
        };
        title: string;
        image_url?: string;
      };
      inventory: {
        variant_name?: string;
      };
      quantity: number;
    }>;
    total_quantity: number;
  } | null;
  cart_owner_type?: CartOwnerType;
  requires_sign_in_for_checkout?: boolean;
  checkout_policy?: {
    max_order_total_minor: number;
  };
  summary: {
    currency: string;
    subtotal_minor: number;
    discount_minor: number;
    subtotal_after_discount_minor: number;
    shipping_minor: number;
    total_minor: number;
    total_selected_quantity: number;
    total_quantity: number;
  };
}

interface CartSummaryInput {
  currency?: string;
  subtotalPrice: number;
  totalDiscount: number;
  subtotalAfterDiscount: number;
  totalShippingFee: number;
  totalPrice: number;
  totalSelectedQuantity: number;
  totalQuantity: number;
}

function resolveCartCurrency(cart: CartSnapshot | null): string {
  return cart?.items[0]?.inventory.pricing.currency ?? 'USD';
}

function toSummaryResponse(
  summary: CartSummaryInput,
  currency: string,
): CartResponse['summary'] {
  return {
    currency,
    subtotal_minor: toMinorUnits(summary.subtotalPrice, currency),
    discount_minor: toMinorUnits(summary.totalDiscount, currency),
    subtotal_after_discount_minor: toMinorUnits(
      summary.subtotalAfterDiscount,
      currency,
    ),
    shipping_minor: toMinorUnits(summary.totalShippingFee, currency),
    total_minor: toMinorUnits(summary.totalPrice, currency),
    total_selected_quantity: summary.totalSelectedQuantity,
    total_quantity: summary.totalQuantity,
  };
}

function resolveCartItemPricing(item: CartItemSnapshot): {
  currency: string;
  unitPriceMinor: number;
  originalAmountMinor?: number;
  unitPriceMajor: number;
} {
  const snapshotPricing = item.inventory.pricing;

  return {
    currency: snapshotPricing.currency,
    unitPriceMinor: snapshotPricing.amountMinor,
    originalAmountMinor: snapshotPricing.originalAmountMinor,
    unitPriceMajor: snapshotPricing.amountMinor / minorUnitDivisor(snapshotPricing.currency),
  };
}

function minorUnitDivisor(currency: string): number {
  return currency === 'JPY' || currency === 'KRW' || currency === 'VND' ? 1 : 100;
}

function formatVariantName(
  variantName?: string,
  variantGroupName?: string,
  variantSubGroupName?: string,
): string | undefined {
  if (!variantName) {
    return undefined;
  }

  const labels = [variantGroupName, variantSubGroupName].filter(
    (label): label is string => Boolean(label?.trim()),
  );

  if (labels.length === 0) {
    return variantName;
  }

  const values = variantName
    .split('/')
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length !== labels.length) {
    return labels.length === 1 ? `${labels[0]}: ${variantName}` : variantName;
  }

  return values.map((value, index) => `${labels[index]}: ${value}`).join(' / ');
}

export function buildCartResponse(
  cart: CartSnapshot | null,
  summaryOverride?: CartSummaryInput,
  options?: {
    ownerType?: CartOwnerType;
    requiresSignInForCheckout?: boolean;
    maxOrderTotalMinor?: number;
  },
): CartResponse {
  const currency = resolveCartCurrency(cart);
  const emptySummary = {
    currency,
    subtotal_minor: 0,
    discount_minor: 0,
    subtotal_after_discount_minor: 0,
    shipping_minor: 0,
    total_minor: 0,
    total_selected_quantity: 0,
    total_quantity: 0,
  };

  const ownerType = options?.ownerType ?? (cart?.userId ? 'user' : 'guest');
  const requiresSignInForCheckout = options?.requiresSignInForCheckout ?? false;

  if (!cart || cart.items.length === 0) {
    return {
      cart: null,
      cart_owner_type: ownerType,
      requires_sign_in_for_checkout: requiresSignInForCheckout,
      ...(options?.maxOrderTotalMinor != null
        ? {
          checkout_policy: {
            max_order_total_minor: options.maxOrderTotalMinor,
          },
        }
        : {}),
      summary: summaryOverride
        ? toSummaryResponse(summaryOverride, summaryOverride.currency ?? currency)
        : emptySummary,
    };
  }

  const groupedByShop = new Map<string, CartShopGroupResponse>();
  let totalQuantity = 0;
  let subtotalPrice = 0;

  const sortedItems = cart.items
    .slice()
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());

  for (const item of sortedItems) {
    totalQuantity += item.quantity;

    const resolvedPricing = resolveCartItemPricing(item);

    if (item.isSelectOrder) {
      subtotalPrice += resolvedPricing.unitPriceMajor * item.quantity;
    }

    const existingShopGroup = groupedByShop.get(item.inventory.shopId) ?? {
      shop: {
        id: item.inventory.shopId,
        name: item.inventory.shopName,
      },
      items: [],
      currency: item.inventory.currency,
      total_minor: 0,
      shipping_minor: 0,
    };

    existingShopGroup.items.push({
      id: item.id,
      quantity: item.quantity,
      is_selected: item.isSelectOrder,
      unit_price_minor: resolvedPricing.unitPriceMinor,
      product: {
        id: item.inventory.productId,
        slug: item.inventory.productSlug,
        shop: {
          slug: item.inventory.shopSlug,
        },
        title: item.inventory.title,
        variant_type: item.inventory.variantType,
        variant_group_name: item.inventory.variantGroupName,
        variant_sub_group_name: item.inventory.variantSubGroupName,
        image_url: item.inventory.imageUrl,
      },
      inventory: {
        id: item.inventory.inventoryId,
        amount_minor: resolvedPricing.unitPriceMinor,
        ...(resolvedPricing.originalAmountMinor != null
          ? { original_amount_minor: resolvedPricing.originalAmountMinor }
          : {}),
        currency: resolvedPricing.currency,
        stock: item.inventory.stock,
        sku: item.inventory.sku,
        variant_name: formatVariantName(
          item.inventory.variantName,
          item.inventory.variantGroupName,
          item.inventory.variantSubGroupName,
        ),
      },
    });

    if (item.isSelectOrder) {
      existingShopGroup.total_minor += resolvedPricing.unitPriceMinor * item.quantity;
    }

    groupedByShop.set(item.inventory.shopId, existingShopGroup);
  }

  return {
    cart: {
      id: cart.id,
      user_id: cart.userId ?? '',
      is_temp: cart.kind === CartKind.BUY_NOW,
      shop_groups: Array.from(groupedByShop.values()),
      recent_items: sortedItems.slice(0, 6).map((item) => ({
        item_id: item.id,
        product: {
          id: item.inventory.productId,
          slug: item.inventory.productSlug,
          shop: {
            slug: item.inventory.shopSlug,
          },
          title: item.inventory.title,
          image_url: item.inventory.thumbnailImageUrl ?? item.inventory.imageUrl,
        },
        inventory: {
          variant_name: formatVariantName(
            item.inventory.variantName,
            item.inventory.variantGroupName,
            item.inventory.variantSubGroupName,
          ),
        },
        quantity: item.quantity,
      })),
      total_quantity: totalQuantity,
    },
    cart_owner_type: ownerType,
    requires_sign_in_for_checkout: requiresSignInForCheckout,
    ...(options?.maxOrderTotalMinor != null
      ? {
        checkout_policy: {
          max_order_total_minor: options.maxOrderTotalMinor,
        },
      }
      : {}),
    summary: summaryOverride
      ? toSummaryResponse(summaryOverride, summaryOverride.currency ?? currency)
      : {
        currency,
        subtotal_minor: toMinorUnits(subtotalPrice, currency),
        discount_minor: 0,
        subtotal_after_discount_minor: toMinorUnits(subtotalPrice, currency),
        shipping_minor: 0,
        total_minor: toMinorUnits(subtotalPrice, currency),
        total_selected_quantity: cart.items
          .filter((item) => item.isSelectOrder)
          .reduce((sum, item) => sum + item.quantity, 0),
        total_quantity: totalQuantity,
      },
  };
}
