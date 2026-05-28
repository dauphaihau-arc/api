import { Migration } from '@mikro-orm/migrations';

export class Migration20260526230000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "shops" add column "currency" varchar(3) not null default 'USD';`);
  }

  override async down(): Promise<void> {
    this.addSql('alter table "shops" drop column "currency";');
  }
}
