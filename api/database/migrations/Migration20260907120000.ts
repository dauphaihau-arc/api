import { Migration } from '@mikro-orm/migrations';

export class Migration20260907120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create unique index if not exists "product_variants_product_name_not_removed_unique"
      on "product_variants" ("product_id", "name")
      where "lifecycle_state" <> 'removed';
    `);
    this.addSql('alter table "product_variants" drop constraint if exists "product_variants_product_id_name_unique";');

    this.addSql(`
      create unique index if not exists "product_inventory_shop_sku_not_removed_unique"
      on "product_inventory" ("shop_id", "sku")
      where "sku" is not null and "lifecycle_state" <> 'removed';
    `);
    this.addSql('alter table "product_inventory" drop constraint if exists "product_inventory_shop_id_sku_unique";');
  }

  override async down(): Promise<void> {
    throw new Error(
      'Migration20260907120000 is forward-only: restoring global Product Variant name and SKU uniqueness is unsafe after removed names or SKUs may have been reused.',
    );
  }
}
