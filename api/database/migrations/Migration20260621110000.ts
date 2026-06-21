import { Migration } from '@mikro-orm/migrations';

export class Migration20260621110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "product_review_image_variants" (
        "id" uuid not null default gen_random_uuid(),
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "product_review_image_id" uuid not null,
        "variant" text check ("variant" in ('original', 'card_1x1', 'thumb_1x1', 'detail_4x5')) not null,
        "storage_key" varchar(500) not null,
        "width" int null,
        "height" int null,
        "format" varchar(20) null,
        constraint "product_review_image_variants_pkey" primary key ("id")
      );
    `);
    this.addSql('create index "product_review_image_variants_image_index" on "product_review_image_variants" ("product_review_image_id");');
    this.addSql('create unique index "product_review_image_variants_image_variant_unique" on "product_review_image_variants" ("product_review_image_id", "variant");');
    this.addSql(`
      alter table "product_review_image_variants"
      add constraint "product_review_image_variants_product_review_image_id_foreign"
      foreign key ("product_review_image_id")
      references "product_review_images" ("id")
      on update cascade
      on delete cascade;
    `);

    this.addSql('alter table "product_review_images" add column "variant_status" text check ("variant_status" in (\'pending\', \'processing\', \'ready\', \'failed\')) not null default \'pending\';');
    this.addSql('alter table "product_review_images" add column "variant_error" text null;');
    this.addSql('alter table "product_review_images" add column "variants_generated_at" timestamptz null;');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "product_review_images" drop column "variant_status";');
    this.addSql('alter table "product_review_images" drop column "variant_error";');
    this.addSql('alter table "product_review_images" drop column "variants_generated_at";');

    this.addSql('drop table if exists "product_review_image_variants" cascade;');
  }
}
