import { Migration } from '@mikro-orm/migrations';

export class Migration20261007130000_add_public_id_prefix extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "shops" alter column "public_id" type varchar(32) using ("public_id"::varchar(32));`);
    this.addSql(`alter table "products" alter column "public_id" type varchar(32) using ("public_id"::varchar(32));`);

    this.addSql(`update "shops" set "public_id" = 'shop_' || "public_id" where left("public_id", 5) <> 'shop_';`);
    this.addSql(`update "products" set "public_id" = 'prod_' || "public_id" where left("public_id", 5) <> 'prod_';`);
  }

  override async down(): Promise<void> {
    this.addSql(`update "shops" set "public_id" = substring("public_id" from 6) where left("public_id", 5) = 'shop_';`);
    this.addSql(`update "products" set "public_id" = substring("public_id" from 6) where left("public_id", 5) = 'prod_';`);

    this.addSql(`alter table "shops" alter column "public_id" type varchar(12) using ("public_id"::varchar(12));`);
    this.addSql(`alter table "products" alter column "public_id" type varchar(12) using ("public_id"::varchar(12));`);
  }
}
