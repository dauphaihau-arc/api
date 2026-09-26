import { Migration } from '@mikro-orm/migrations';

/**
 * `product_inventory` holds the derived aggregate of an Inventory Item's Stock
 * Pools: On-hand Quantity, Reserved Quantity, On-hand Version, and Stock. It is
 * a read model for catalog, cart, and storefront availability, never a balance
 * writer — every quantity change belongs to `product_stock_pool`.
 *
 * Three application writers used to maintain that mirror by hand (the local
 * reservation service, the local stock-pool service, and the Go inventory
 * authority). Three writers with no database-level coupling means the mirror can
 * drift from the ledger whenever a writer forgets it. This migration moves the
 * mirror into the database: a row-level trigger recomputes the aggregate from the
 * pools themselves, so no application code writes those columns and drift is
 * structurally impossible.
 *
 * The trigger fires on the quantity columns (`on_hand_quantity`,
 * `reserved_quantity`, `on_hand_version`), which every pool mutation sets. A
 * future quantity column on the pool must be added to that column list.
 */
export class Migration20260924110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create or replace function product_stock_pool_mirror_inventory_aggregate()
      returns trigger
      language plpgsql
      as $$
      begin
        update product_inventory
        set on_hand_quantity = aggregate.on_hand_quantity,
            reserved_quantity = aggregate.reserved_quantity,
            on_hand_version = aggregate.on_hand_version,
            stock = greatest(aggregate.on_hand_quantity - aggregate.reserved_quantity, 0),
            updated_at = now()
        from (
          select coalesce(sum(on_hand_quantity), 0) as on_hand_quantity,
                 coalesce(sum(reserved_quantity), 0) as reserved_quantity,
                 coalesce(max(on_hand_version), 1) as on_hand_version
          from product_stock_pool
          where inventory_id = new.inventory_id
        ) aggregate
        where product_inventory.id = new.inventory_id;

        return null;
      end;
      $$;
    `);
    this.addSql(`
      create trigger product_stock_pool_mirror_inventory_aggregate
      after insert or update of on_hand_quantity, reserved_quantity, on_hand_version
      on product_stock_pool
      for each row
      execute function product_stock_pool_mirror_inventory_aggregate();
    `);

    // One-time resync so the mirror starts from the ledger. Rows that already
    // agree are left untouched, including their updated_at.
    this.addSql(`
      update product_inventory
      set on_hand_quantity = aggregate.on_hand_quantity,
          reserved_quantity = aggregate.reserved_quantity,
          on_hand_version = aggregate.on_hand_version,
          stock = greatest(aggregate.on_hand_quantity - aggregate.reserved_quantity, 0),
          updated_at = now()
      from (
        select inventory_id,
               coalesce(sum(on_hand_quantity), 0) as on_hand_quantity,
               coalesce(sum(reserved_quantity), 0) as reserved_quantity,
               coalesce(max(on_hand_version), 1) as on_hand_version
        from product_stock_pool
        group by inventory_id
      ) aggregate
      where product_inventory.id = aggregate.inventory_id
        and (
          product_inventory.on_hand_quantity,
          product_inventory.reserved_quantity,
          product_inventory.on_hand_version,
          product_inventory.stock
        ) is distinct from (
          aggregate.on_hand_quantity,
          aggregate.reserved_quantity,
          aggregate.on_hand_version,
          greatest(aggregate.on_hand_quantity - aggregate.reserved_quantity, 0)
        );
    `);
  }

  override async down(): Promise<void> {
    throw new Error(
      'Migration20260924110000 is forward-only: the derived product_inventory aggregate has no other writer, so dropping the mirror trigger would leave it stale.',
    );
  }
}
