import { Migration } from '@mikro-orm/migrations';

export class Migration20261019120000_create_payout_availabilities extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "payout_availabilities" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "order_id" uuid not null,
        "shop_id" uuid not null,
        "currency" varchar(3) not null,
        "amount_minor" int not null,
        "delivered_at" timestamptz not null,
        "evidence" jsonb not null,
        constraint "payout_availabilities_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      alter table "payout_availabilities"
        add constraint "payout_availabilities_order_id_unique"
        unique ("order_id");
    `);

    this.addSql(`
      alter table "payout_availabilities"
        add constraint "payout_availabilities_shop_id_foreign"
        foreign key ("shop_id") references "shops" ("id")
        on update cascade on delete restrict;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "payout_availabilities"
        drop constraint "payout_availabilities_shop_id_foreign";
    `);

    this.addSql('drop table if exists "payout_availabilities" cascade;');
  }
}
