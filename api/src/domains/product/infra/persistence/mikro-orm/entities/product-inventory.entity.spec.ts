import { ProductInventoryEntity } from './product-inventory.entity';

describe('ProductInventoryEntity', () => {
  it('derives Available Quantity without allowing negative availability', () => {
    const inventory = new ProductInventoryEntity();
    inventory.onHandQuantity = 4;
    inventory.reservedQuantity = 7;

    expect(inventory.availableQuantity).toBe(0);
    expect(inventory.shortage).toBe(3);
  });

  it('derives On-hand Quantity from legacy stock-only creates before insert validation', () => {
    const inventory = new ProductInventoryEntity();
    inventory.stock = 23;

    inventory.ensureOnHandQuantityForLegacyStockCreates();

    expect(inventory.onHandQuantity).toBe(23);
  });

  it('increments On-hand Version only when the seller accepted count changes physical quantity', () => {
    const inventory = new ProductInventoryEntity();
    inventory.onHandQuantity = 5;
    inventory.reservedQuantity = 2;
    inventory.onHandVersion = 3;

    inventory.applyOnHandCount({
      onHandQuantity: 8,
      expectedOnHandVersion: 3,
    });
    inventory.reserve(2);
    inventory.release(1);

    expect(inventory.onHandQuantity).toBe(8);
    expect(inventory.reservedQuantity).toBe(3);
    expect(inventory.availableQuantity).toBe(5);
    expect(inventory.onHandVersion).toBe(4);
  });

  it('rejects stale On-hand Version conflicts with current quantities', () => {
    const inventory = new ProductInventoryEntity();
    inventory.onHandQuantity = 5;
    inventory.reservedQuantity = 2;
    inventory.onHandVersion = 3;

    expect(() => inventory.applyOnHandCount({
      onHandQuantity: 8,
      expectedOnHandVersion: 2,
    })).toThrow('On-hand Version conflict');
    expect(inventory.onHandQuantity).toBe(5);
    expect(inventory.onHandVersion).toBe(3);
  });
});
