import { Migration } from '@mikro-orm/migrations';

export class Migration20260522161000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "product_images"
      add column "variant_status" varchar(255) not null default 'pending',
      add column "variant_error" text null,
      add column "variants_generated_at" timestamptz null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "product_images"
      drop column "variant_status",
      drop column "variant_error",
      drop column "variants_generated_at";
    `);
  }
}
