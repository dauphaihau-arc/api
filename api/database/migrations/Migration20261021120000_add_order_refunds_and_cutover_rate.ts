import { Migration } from '@mikro-orm/migrations';

/**
 * Adds the Order Refund fact — one row per refund request, carrying its amount
 * in the currency the buyer paid, the provider's refund id, and its outcome —
 * and the Cutover Rate a Settlement Currency change records on its history row.
 *
 * A refund fact is a Money Event: its row identity keys the Finance Journal
 * Entry, so a redelivered or replayed refund cannot be posted twice.
 */
export class Migration20261021120000_add_order_refunds_and_cutover_rate extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "order_refunds" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "order_id" uuid not null,
        "currency" varchar(3) not null,
        "amount_minor" int not null,
        "refunded_amount_minor" int null,
        "provider_refund_id" varchar(255) null,
        "status" text not null check ("status" in ('pending', 'succeeded', 'failed')),
        "failure_reason" text null,
        "requested_at" timestamptz not null,
        "completed_at" timestamptz null,
        constraint "order_refunds_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      create index "order_refunds_order_id_index"
        on "order_refunds" ("order_id");
    `);

    this.addSql(`
      create unique index "order_refunds_one_pending_per_order_unique"
        on "order_refunds" ("order_id")
        where "status" = 'pending';
    `);
    this.addSql(`
      create unique index "order_refunds_provider_refund_id_unique"
        on "order_refunds" ("provider_refund_id")
        where "provider_refund_id" is not null;
    `);
    this.addSql(`
      alter table "order_refunds"
        add constraint "order_refunds_order_id_foreign"
        foreign key ("order_id") references "orders" ("id")
        on update cascade on delete cascade;
    `);

    // A change of Settlement Currency records the rate that converts the
    // previous currency into the new one, so a later reversal of an earlier
    // Money Event converts deterministically instead of at today's rate.
    this.addSql(`
      alter table "settlement_currency_history"
        add column "previous_currency" varchar(3) null,
        add column "cutover_rate" text null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "settlement_currency_history"
        drop column "cutover_rate",
        drop column "previous_currency";
    `);

    this.addSql(`
      alter table "order_refunds"
        drop constraint "order_refunds_order_id_foreign";
    `);
    this.addSql('drop table if exists "order_refunds" cascade;');
  }
}
