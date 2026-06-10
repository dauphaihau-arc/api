export const PRODUCT_INVENTORY_UPDATED_SSE_EVENT = 'sse.product.inventory.updated';

export type ProductInventorySseStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export type ProductInventoryUpdatedSseEventPayload = {
  productId: string;
  inventoryId: string;
  stock: number;
  status: ProductInventorySseStatus;
  occurredAt?: string;
};

export const PRODUCT_INVENTORY_SSE_LOW_STOCK_THRESHOLD = 10;

export function buildProductInventoryChannelKey(productId: string): string {
  return `product:${productId}:inventory`;
}

export function resolveProductInventorySseStatus(
  stock: number
): ProductInventorySseStatus {
  if (stock <= 0) {
    return 'out_of_stock';
  }

  if (stock < PRODUCT_INVENTORY_SSE_LOW_STOCK_THRESHOLD) {
    return 'low_stock';
  }

  return 'in_stock';
}

export function buildProductInventoryUpdatedSseEvent(
  input: Omit<ProductInventoryUpdatedSseEventPayload, 'status' | 'occurredAt'> &
    Partial<Pick<ProductInventoryUpdatedSseEventPayload, 'status' | 'occurredAt'>>
): ProductInventoryUpdatedSseEventPayload {
  return {
    productId: input.productId,
    inventoryId: input.inventoryId,
    stock: input.stock,
    status: input.status ?? resolveProductInventorySseStatus(input.stock),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };
}
