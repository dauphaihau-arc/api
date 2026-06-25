import { Migration } from '@mikro-orm/migrations';

export class Migration20260624050500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'alter table "shops" alter column "shop_name" type varchar(255) using ("shop_name"::varchar(255));',
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      'alter table "shops" alter column "shop_name" type varchar(20) using ("shop_name"::varchar(20));',
    );
  }
}
