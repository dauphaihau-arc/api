import { Migration } from '@mikro-orm/migrations';

export class Migration20260814100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create index if not exists "checkout_stock_reservations_active_inventory_expires_index"
      on "checkout_stock_reservations" ("inventory_id", "expires_at")
      where "status" = 'active';
    `);

    this.addSql(`
      create index if not exists "checkout_stock_reservations_active_quote_inventory_index"
      on "checkout_stock_reservations" ("quote_id", "inventory_id")
      where "status" = 'active';
    `);

    this.addSql(`
      create index if not exists "checkout_stock_reservations_active_quote_expires_index"
      on "checkout_stock_reservations" ("quote_id", "expires_at")
      where "status" = 'active';
    `);

    this.addSql(`
      create index if not exists "checkout_quotes_reservation_id_index"
      on "checkout_quotes" ("reservation_id")
      where "reservation_id" is not null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop index if exists "checkout_quotes_reservation_id_index";');
    this.addSql('drop index if exists "checkout_stock_reservations_active_quote_expires_index";');
    this.addSql('drop index if exists "checkout_stock_reservations_active_quote_inventory_index";');
    this.addSql('drop index if exists "checkout_stock_reservations_active_inventory_expires_index";');
  }
}
