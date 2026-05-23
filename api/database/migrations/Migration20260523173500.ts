import { Migration } from '@mikro-orm/migrations';

export class Migration20260523173500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "orders"
      add column if not exists "customer_email" varchar(320) null;
    `);

    this.addSql(`
      update "orders" as "orders"
      set "customer_email" = "users"."email"
      from "users"
      where "orders"."user_id" = "users"."id"
        and "orders"."customer_email" is null;
    `);

    this.addSql(`
      alter table "orders"
      alter column "customer_email" set not null,
      alter column "user_id" drop not null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "orders"
      alter column "user_id" set not null,
      drop column if exists "customer_email";
    `);
  }
}
