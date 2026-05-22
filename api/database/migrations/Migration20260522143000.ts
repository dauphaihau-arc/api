import { Migration } from '@mikro-orm/migrations';

export class Migration20260522143000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "product_image_variants" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "product_image_id" uuid not null,
        "variant" varchar(255) not null,
        "storage_key" varchar(500) not null,
        "width" int null,
        "height" int null,
        "format" varchar(20) null,
        constraint "product_image_variants_pkey" primary key ("id")
      );
    `);
    this.addSql('create index "product_image_variants_product_image_id_index" on "product_image_variants" ("product_image_id");');
    this.addSql('create unique index "product_image_variants_product_image_id_variant_unique" on "product_image_variants" ("product_image_id", "variant");');
    this.addSql(`
      alter table "product_image_variants"
      add constraint "product_image_variants_product_image_id_foreign"
      foreign key ("product_image_id")
      references "product_images" ("id")
      on update cascade
      on delete cascade;
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "product_image_variants" cascade;');
  }
}
