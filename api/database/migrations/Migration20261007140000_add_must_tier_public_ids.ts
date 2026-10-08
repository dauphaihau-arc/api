import { Migration } from '@mikro-orm/migrations';

export class Migration20261007140000_add_must_tier_public_ids extends Migration {
  override async up(): Promise<void> {
    const tables: Array<{ table: string; prefix: string }> = [
      { table: 'orders', prefix: 'ord' },
      { table: 'shipments', prefix: 'shp' },
      { table: 'chat_conversations', prefix: 'cnv' },
      { table: 'order_exports', prefix: 'exp' },
      { table: 'product_imports', prefix: 'imp' },
      { table: 'promotions', prefix: 'prm' },
    ];

    for (const { table, prefix } of tables) {
      this.addSql(`alter table "${table}" add column "public_id" varchar(32) null;`);
      this.addSql(
        `update "${table}" set "public_id" = '${prefix}_' || substring(replace("id"::text, '-', '') from 1 for 12) where "public_id" is null;`,
      );
      this.addSql(`alter table "${table}" alter column "public_id" set not null;`);
      this.addSql(`alter table "${table}" add constraint "${table}_public_id_unique" unique ("public_id");`);
    }
  }

  override async down(): Promise<void> {
    const tables = ['orders', 'shipments', 'chat_conversations', 'order_exports', 'product_imports', 'promotions'];

    for (const table of tables) {
      this.addSql(`alter table "${table}" drop constraint if exists "${table}_public_id_unique";`);
      this.addSql(`alter table "${table}" drop column if exists "public_id";`);
    }
  }
}
