import { Migration } from '@mikro-orm/migrations';

export class Migration20260515000300 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "orders" alter column "shipping_to_country" type varchar(255) using ("shipping_to_country"::varchar(255));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "orders" alter column "shipping_to_country" type varchar(2) using ("shipping_to_country"::varchar(2));`);
  }
}
