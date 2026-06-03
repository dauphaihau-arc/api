import { Migration } from '@mikro-orm/migrations';

export class Migration20260602153000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "orders"
      add column if not exists "order_number" varchar(25);
    `);

    this.addSql(`
      update "orders"
      set "order_number" = concat(
        'ORD-',
        to_char(timezone('UTC', "created_at"), 'YYYYMMDD'),
        '-',
        upper(substr(replace("id"::text, '-', ''), 1, 8))
      )
      where "order_number" is null;
    `);

    this.addSql(`
      alter table "orders"
      alter column "order_number" set not null;
    `);

    this.addSql(`
      create unique index if not exists "orders_order_number_unique"
      on "orders" ("order_number");
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      drop index if exists "orders_order_number_unique";
    `);

    this.addSql(`
      alter table "orders"
      drop column if exists "order_number";
    `);
  }
}
