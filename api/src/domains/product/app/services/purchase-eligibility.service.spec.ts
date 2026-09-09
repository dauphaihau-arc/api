import type { EntityManager } from '@mikro-orm/postgresql';
import { ProductInventoryEntity } from '../../infra/persistence/mikro-orm/entities/product-inventory.entity';
import { PurchaseEligibilityService } from './purchase-eligibility.service';

function buildService(inventories: Array<Record<string, unknown>>) {
  const repository = {
    find: jest.fn().mockResolvedValue(inventories),
  };
  const entityManager = {
    fork: jest.fn(() => entityManager),
    getRepository: jest.fn((entity: { name?: string }) => {
      if (entity === ProductInventoryEntity) {
        return repository;
      }

      throw new Error(`Unexpected repository ${entity?.name ?? 'unknown'}`);
    }),
  } as unknown as EntityManager;

  return {
    repository,
    service: new PurchaseEligibilityService(entityManager),
  };
}

describe('PurchaseEligibilityService', () => {
  it('rejects inactive and removed catalog lifecycle states from public purchase checks', async () => {
    const { service } = buildService([
      {
        id: 'inventory-inactive-product',
        stock: 10,
        product: { state: 'inactive' },
      },
      {
        id: 'inventory-removed-variant',
        stock: 10,
        product: { state: 'active' },
        productVariant: { state: 'removed' },
      },
    ]);

    const result = await service.evaluate({
      items: [
        { inventoryId: 'inventory-inactive-product', quantity: 1, title: 'Mug' },
        { inventoryId: 'inventory-removed-variant', quantity: 1, title: 'Blue Mug' },
      ],
    });

    expect(result).toEqual({
      eligible: false,
      failures: [
        expect.objectContaining({
          inventoryId: 'inventory-inactive-product',
          reason: 'product_inactive',
          productState: 'inactive',
        }),
        expect.objectContaining({
          inventoryId: 'inventory-removed-variant',
          reason: 'variant_inactive',
          productVariantState: 'removed',
        }),
      ],
    });
  });

  it('rejects missing or insufficient available inventory', async () => {
    const { service } = buildService([
      {
        id: 'inventory-short',
        availableQuantity: 1,
        stock: 10,
        product: { state: 'active' },
      },
    ]);

    const result = await service.evaluate({
      items: [
        { inventoryId: 'inventory-short', quantity: 2 },
        { inventoryId: 'inventory-missing', quantity: 1 },
      ],
    });

    expect(result.eligible).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({
        inventoryId: 'inventory-missing',
        reason: 'inventory_not_found',
      }),
      expect.objectContaining({
        inventoryId: 'inventory-short',
        reason: 'insufficient_available_quantity',
        availableQuantity: 1,
      }),
    ]);
  });

  it('can recheck lifecycle without requiring new available quantity for held reservations', async () => {
    const { service } = buildService([
      {
        id: 'inventory-held',
        availableQuantity: 0,
        stock: 0,
        product: { state: 'active' },
        productVariant: { state: 'active' },
      },
    ]);

    const result = await service.evaluate({
      items: [{ inventoryId: 'inventory-held', quantity: 2 }],
      requireAvailableQuantity: false,
    });

    expect(result).toEqual({ eligible: true, failures: [] });
  });
});
