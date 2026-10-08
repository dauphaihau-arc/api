import { CartKind } from '../domain/enums/cart-kind.enum';
import { fromMinorUnits, toMinorUnits } from '~/platform/money/money';

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

export interface CartSelectedOptionSnapshot {
  optionId: string;
  optionName: string;
  valueId: string;
  value: string;
}

export interface CartInventoryCandidate {
  inventoryId: string;
  productId: string;
  productPublicId: string;
  productSlug: string;
  shopId: string;
  shopPublicId: string;
  shopName: string;
  shopSlug: string;
  title: string;
  imageUrl?: string;
  imageReference?: string;
  thumbnailImageUrl?: string;
  selectedOptions?: CartSelectedOptionSnapshot[];
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
    image_url?: string;
  };
  inventory: {
    id: string;
    amount_minor: number;
    original_amount_minor?: number;
    currency: string;
    stock: number;
    sku?: string;
    selected_options: Array<{
      option_id: string;
      option_name: string;
      value_id: string;
      value: string;
    }>;
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
  /**
   * Merchandise discount applied to this shop's selected items by its accepted
   * promo codes, in minor units. Zero until the cart is priced with codes.
   */
  discount_minor: number;
  /** Sale reduction already reflected in the shop's effective item prices. */
  sale_discount_minor: number;
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
        selected_options: Array<{
          option_id: string;
          option_name: string;
          value_id: string;
          value: string;
        }>;
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
    unitPriceMajor: fromMinorUnits(snapshotPricing.amountMinor, snapshotPricing.currency),
  };
}


export function buildCartResponse(
  cart: CartSnapshot | null,
  summaryOverride?: CartSummaryInput,
  options?: {
    ownerType?: CartOwnerType;
    requiresSignInForCheckout?: boolean;
    maxOrderTotalMinor?: number;
    /** Per-shop discount when the caller priced the cart with its promo codes. */
    shopDiscounts?: ReadonlyArray<{
      shopId: string;
      discountMinor: number;
      saleDiscountMinor: number;
    }>;
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
        id: item.inventory.shopPublicId,
        name: item.inventory.shopName,
      },
      items: [],
      currency: item.inventory.currency,
      total_minor: 0,
      discount_minor: 0,
      sale_discount_minor: 0,
      shipping_minor: 0,
    };

    existingShopGroup.items.push({
      id: item.id,
      quantity: item.quantity,
      is_selected: item.isSelectOrder,
      unit_price_minor: resolvedPricing.unitPriceMinor,
      product: {
        id: item.inventory.productPublicId,
        slug: item.inventory.productSlug,
        shop: {
          slug: item.inventory.shopSlug,
        },
        title: item.inventory.title,
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
        selected_options: (item.inventory.selectedOptions ?? []).map((selection) => ({
          option_id: selection.optionId,
          option_name: selection.optionName,
          value_id: selection.valueId,
          value: selection.value,
        })),
      },
    });

    if (item.isSelectOrder) {
      existingShopGroup.total_minor += resolvedPricing.unitPriceMinor * item.quantity;
    }

    groupedByShop.set(item.inventory.shopId, existingShopGroup);
  }

  const shopDiscountById = new Map(
    (options?.shopDiscounts ?? []).map((entry) => [entry.shopId, entry]),
  );

  return {
    cart: {
      id: cart.id,
      user_id: cart.userId ?? '',
      is_temp: cart.kind === CartKind.BUY_NOW,
      shop_groups: Array.from(groupedByShop.entries()).map(([shopId, group]) => {
        const shopDiscount = shopDiscountById.get(shopId);

        return shopDiscount
          ? {
            ...group,
            discount_minor: shopDiscount.discountMinor,
            sale_discount_minor: shopDiscount.saleDiscountMinor,
          }
          : group;
      }),
      recent_items: sortedItems.slice(0, 6).map((item) => ({
        item_id: item.id,
        product: {
          id: item.inventory.productPublicId,
          slug: item.inventory.productSlug,
          shop: {
            slug: item.inventory.shopSlug,
          },
          title: item.inventory.title,
          image_url: item.inventory.thumbnailImageUrl ?? item.inventory.imageUrl,
        },
        inventory: {
          selected_options: (item.inventory.selectedOptions ?? []).map((selection) => ({
            option_id: selection.optionId,
            option_name: selection.optionName,
            value_id: selection.valueId,
            value: selection.value,
          })),
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
