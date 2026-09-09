import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ProductInventoryEntity } from '../../infra/persistence/mikro-orm/entities/product-inventory.entity';

export type PurchaseEligibilityFailureReason =
  | 'inventory_not_found'
  | 'product_inactive'
  | 'variant_inactive'
  | 'inventory_unreservable'
  | 'insufficient_available_quantity';

export interface PurchaseEligibilityItemInput {
  inventoryId: string;
  quantity: number;
  title?: string;
}

export interface PurchaseEligibilityInput {
  items: PurchaseEligibilityItemInput[];
  requireAvailableQuantity?: boolean;
}

export interface PurchaseEligibilityContext {
  entityManager?: EntityManager;
}

export interface PurchaseEligibilityFailure extends PurchaseEligibilityItemInput {
  reason: PurchaseEligibilityFailureReason;
  productState?: string;
  productVariantState?: string;
  inventoryState?: string;
  availableQuantity?: number;
}

export interface PurchaseEligibilityResult {
  eligible: boolean;
  failures: PurchaseEligibilityFailure[];
}

@Injectable()
export class PurchaseEligibilityService {
  constructor(private readonly entityManager: EntityManager) {}

  async evaluate(
    input: PurchaseEligibilityInput,
    context?: PurchaseEligibilityContext,
  ): Promise<PurchaseEligibilityResult> {
    const requestedItems = this.aggregateItems(input.items);
    const inventoryIds = requestedItems.map((item) => item.inventoryId);

    if (inventoryIds.length === 0) {
      return { eligible: true, failures: [] };
    }

    const entityManager = context?.entityManager ?? this.entityManager.fork();
    const inventories = await entityManager.getRepository(ProductInventoryEntity).find(
      { id: { $in: inventoryIds } },
      { populate: ['product', 'productVariant'], orderBy: { id: 'asc' } },
    );
    const inventoryById = new Map(inventories.map((inventory) => [inventory.id, inventory]));
    const failures: PurchaseEligibilityFailure[] = [];
    const requireAvailableQuantity = input.requireAvailableQuantity !== false;

    for (const item of requestedItems) {
      const inventory = inventoryById.get(item.inventoryId);

      if (!inventory) {
        failures.push({ ...item, reason: 'inventory_not_found' });
        continue;
      }

      const productState = String(inventory.product.state);
      const productVariantState = resolveState(inventory.productVariant, 'active');
      const inventoryState = resolveState(inventory, 'active');
      const availableQuantity = resolveAvailableQuantity(inventory);

      if (productState !== 'active') {
        failures.push({ ...item, productState, reason: 'product_inactive' });
        continue;
      }

      if (inventory.productVariant && productVariantState !== 'active') {
        failures.push({
          ...item,
          productVariantState,
          reason: 'variant_inactive',
        });
        continue;
      }

      if (inventoryState === 'inactive' || inventoryState === 'removed') {
        failures.push({ ...item, inventoryState, reason: 'inventory_unreservable' });
        continue;
      }

      if (requireAvailableQuantity && availableQuantity < item.quantity) {
        failures.push({
          ...item,
          availableQuantity,
          reason: 'insufficient_available_quantity',
        });
      }
    }

    return {
      eligible: failures.length === 0,
      failures,
    };
  }

  private aggregateItems(items: PurchaseEligibilityItemInput[]): PurchaseEligibilityItemInput[] {
    const itemByInventoryId = new Map<string, PurchaseEligibilityItemInput>();

    for (const item of items) {
      const existing = itemByInventoryId.get(item.inventoryId);

      if (existing) {
        existing.quantity += item.quantity;
        continue;
      }

      itemByInventoryId.set(item.inventoryId, { ...item });
    }

    return [...itemByInventoryId.values()].sort((left, right) =>
      left.inventoryId.localeCompare(right.inventoryId));
  }
}

function resolveState(source: unknown, fallback: string): string {
  if (!source || typeof source !== 'object') {
    return fallback;
  }

  const record = source as Record<string, unknown>;
  const state = record['lifecycleState'] ?? record['state'] ?? record['status'];

  return typeof state === 'string' ? state : fallback;
}

function resolveAvailableQuantity(inventory: ProductInventoryEntity): number {
  const record = inventory as unknown as Record<string, unknown>;
  const availableQuantity = record['availableQuantity'] ?? record['available_quantity'];

  if (typeof availableQuantity === 'number') {
    return availableQuantity;
  }

  return inventory.stock;
}
