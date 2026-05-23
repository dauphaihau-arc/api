import { Migration } from '@mikro-orm/migrations';

export class Migration20260523110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "orders" alter column "user_id" drop not null;');
    this.addSql('alter table "orders" add column "customer_email" varchar(320) not null default \'\';');
    this.addSql('update "orders" set "customer_email" = coalesce((select "email" from "users" where "users"."id" = "orders"."user_id"), \'\');');
    this.addSql('alter table "coupon_usages" alter column "user_id" drop not null;');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "coupon_usages" alter column "user_id" set not null;');
    this.addSql('alter table "orders" drop column "customer_email";');
    this.addSql('alter table "orders" alter column "user_id" set not null;');
  }
}
