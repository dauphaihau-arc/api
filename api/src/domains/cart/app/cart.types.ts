import type { CartKind } from '../domain/enums/cart-kind.enum';

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

export interface CartSummaryInput {
  currency?: string;
  subtotalPrice: number;
  totalDiscount: number;
  subtotalAfterDiscount: number;
  totalShippingFee: number;
  totalPrice: number;
  totalSelectedQuantity: number;
  totalQuantity: number;
}
