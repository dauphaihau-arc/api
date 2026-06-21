import { Migration } from '@mikro-orm/migrations';

export class Migration20260620093000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "product_review_images" add column "size_bytes" int null;');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "product_review_images" drop column "size_bytes";');
  }
}
