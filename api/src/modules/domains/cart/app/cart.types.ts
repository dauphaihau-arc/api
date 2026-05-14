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
  isSelected: boolean;
  unitPrice: number;
  product: {
    id: string;
    title: string;
    variantType: string;
    variantGroupName?: string;
    variantSubGroupName?: string;
    imageUrl?: string;
  };
  inventory: {
    id: string;
    price: number;
    salePrice?: number;
    stock: number;
    sku?: string;
    variantName?: string;
  };
}

export interface CartShopGroupResponse {
  shop: {
    id: string;
    name: string;
  };
  items: CartProductItemResponse[];
  totalPrice: number;
  totalShippingFee: number;
}

export interface CartResponse {
  cart: {
    id: string;
    userId: string;
    isTemp: boolean;
    shopGroups: CartShopGroupResponse[];
    recentItems: Array<{
      itemId: string;
      product: {
        id: string;
        title: string;
        imageUrl?: string;
      };
      inventory: {
        variantName?: string;
      };
      quantity: number;
    }>;
    totalQuantity: number;
  } | null;
  summary: {
    subtotalPrice: number;
    totalDiscount: number;
    subtotalAfterDiscount: number;
    totalShippingFee: number;
    totalPrice: number;
    totalSelectedQuantity: number;
    totalQuantity: number;
  };
}

export function buildCartResponse(cart: CartSnapshot | null): CartResponse {
  const emptySummary = {
    subtotalPrice: 0,
    totalDiscount: 0,
    subtotalAfterDiscount: 0,
    totalShippingFee: 0,
    totalPrice: 0,
    totalSelectedQuantity: 0,
    totalQuantity: 0,
  };

  if (!cart || cart.items.length === 0) {
    return {
      cart: null,
      summary: emptySummary,
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
      totalPrice: 0,
      totalShippingFee: 0,
    };

    existingShopGroup.items.push({
      id: item.id,
      quantity: item.quantity,
      isSelected: item.isSelectOrder,
      unitPrice,
      product: {
        id: item.inventory.productId,
        title: item.inventory.title,
        variantType: item.inventory.variantType,
        variantGroupName: item.inventory.variantGroupName,
        variantSubGroupName: item.inventory.variantSubGroupName,
        imageUrl: item.inventory.imageStorageKey,
      },
      inventory: {
        id: item.inventory.inventoryId,
        price: item.inventory.price,
        salePrice: item.inventory.salePrice,
        stock: item.inventory.stock,
        sku: item.inventory.sku,
        variantName: item.inventory.variantName,
      },
    });

    if (item.isSelectOrder) {
      existingShopGroup.totalPrice += unitPrice * item.quantity;
    }

    groupedByShop.set(item.inventory.shopId, existingShopGroup);
  }

  return {
    cart: {
      id: cart.id,
      userId: cart.userId,
      isTemp: cart.isTemp,
      shopGroups: Array.from(groupedByShop.values()),
      recentItems: sortedItems.slice(0, 6).map((item) => ({
        itemId: item.id,
        product: {
          id: item.inventory.productId,
          title: item.inventory.title,
          imageUrl: item.inventory.imageStorageKey,
        },
        inventory: {
          variantName: item.inventory.variantName,
        },
        quantity: item.quantity,
      })),
      totalQuantity,
    },
    summary: {
      subtotalPrice,
      totalDiscount: 0,
      subtotalAfterDiscount: subtotalPrice,
      totalShippingFee: 0,
      totalPrice: subtotalPrice,
      totalSelectedQuantity: cart.items
        .filter((item) => item.isSelectOrder)
        .reduce((sum, item) => sum + item.quantity, 0),
      totalQuantity,
    },
  };
}
