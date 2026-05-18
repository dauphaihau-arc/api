export interface CartInventoryCandidate {
  inventoryId: string;
  productId: string;
  shopId: string;
  shopName: string;
  title: string;
  variantType: string;
  variantGroupName?: string;
  variantSubGroupName?: string;
  imageStorageKey?: string;
  variantName?: string;
  stock: number;
  price: number;
  salePrice?: number;
  sku?: string;
  productState: string;
}

export interface CartItemSnapshot {
  id: string;
  quantity: number;
  isSelectOrder: boolean;
  updatedAt: Date;
  inventory: CartInventoryCandidate;
}

export interface CartSnapshot {
  id: string;
  userId: string;
  isTemp: boolean;
  items: CartItemSnapshot[];
}

export interface CartProductItemResponse {
  id: string;
  quantity: number;
  is_selected: boolean;
  unit_price: number;
  product: {
    id: string;
    title: string;
    variant_type: string;
    variant_group_name?: string;
    variant_sub_group_name?: string;
    image_url?: string;
  };
  inventory: {
    id: string;
    price: number;
    sale_price?: number;
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
  total_price: number;
  total_shipping_fee: number;
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
  summary: {
    subtotal_price: number;
    total_discount: number;
    subtotal_after_discount: number;
    total_shipping_fee: number;
    total_price: number;
    total_selected_quantity: number;
    total_quantity: number;
  };
}

export function buildCartResponse(
  cart: CartSnapshot | null,
  summaryOverride?: CartResponse['summary']
): CartResponse {
  const emptySummary = {
    subtotal_price: 0,
    total_discount: 0,
    subtotal_after_discount: 0,
    total_shipping_fee: 0,
    total_price: 0,
    total_selected_quantity: 0,
    total_quantity: 0,
  };

  if (!cart || cart.items.length === 0) {
    return {
      cart: null,
      summary: summaryOverride ?? emptySummary,
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

    const unitPrice = item.inventory.salePrice ?? item.inventory.price;

    if (item.isSelectOrder) {
      subtotalPrice += unitPrice * item.quantity;
    }

    const existingShopGroup = groupedByShop.get(item.inventory.shopId) ?? {
      shop: {
        id: item.inventory.shopId,
        name: item.inventory.shopName,
      },
      items: [],
      total_price: 0,
      total_shipping_fee: 0,
    };

    existingShopGroup.items.push({
      id: item.id,
      quantity: item.quantity,
      is_selected: item.isSelectOrder,
      unit_price: unitPrice,
      product: {
        id: item.inventory.productId,
        title: item.inventory.title,
        variant_type: item.inventory.variantType,
        variant_group_name: item.inventory.variantGroupName,
        variant_sub_group_name: item.inventory.variantSubGroupName,
        image_url: item.inventory.imageStorageKey,
      },
      inventory: {
        id: item.inventory.inventoryId,
        price: item.inventory.price,
        sale_price: item.inventory.salePrice,
        stock: item.inventory.stock,
        sku: item.inventory.sku,
        variant_name: item.inventory.variantName,
      },
    });

    if (item.isSelectOrder) {
      existingShopGroup.total_price += unitPrice * item.quantity;
    }

    groupedByShop.set(item.inventory.shopId, existingShopGroup);
  }

  return {
    cart: {
      id: cart.id,
      user_id: cart.userId,
      is_temp: cart.isTemp,
      shop_groups: Array.from(groupedByShop.values()),
      recent_items: sortedItems.slice(0, 6).map((item) => ({
        item_id: item.id,
        product: {
          id: item.inventory.productId,
          title: item.inventory.title,
          image_url: item.inventory.imageStorageKey,
        },
        inventory: {
          variant_name: item.inventory.variantName,
        },
        quantity: item.quantity,
      })),
      total_quantity: totalQuantity,
    },
    summary: summaryOverride ?? {
      subtotal_price: subtotalPrice,
      total_discount: 0,
      subtotal_after_discount: subtotalPrice,
      total_shipping_fee: 0,
      total_price: subtotalPrice,
      total_selected_quantity: cart.items
        .filter((item) => item.isSelectOrder)
        .reduce((sum, item) => sum + item.quantity, 0),
      total_quantity: totalQuantity,
    },
  };
}
