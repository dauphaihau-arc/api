import { Migration } from '@mikro-orm/migrations';

export class Migration20260523110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "orders"
      add column "tracking_number" varchar(255) null,
      add column "shipping_carrier" varchar(255) null,
      add column "shipment_note" text null,
      add column "shipped_at" timestamptz null,
      add column "delivered_at" timestamptz null,
      add column "canceled_at" timestamptz null,
      add column "cancel_reason" text null,
      add column "refunded_at" timestamptz null,
      add column "support_note" text null,
      add column "customer_support_note" text null,
      add column "cancel_requested_at" timestamptz null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "orders"
      drop column "tracking_number",
      drop column "shipping_carrier",
      drop column "shipment_note",
      drop column "shipped_at",
      drop column "delivered_at",
      drop column "canceled_at",
      drop column "cancel_reason",
      drop column "refunded_at",
      drop column "support_note",
      drop column "customer_support_note",
      drop column "cancel_requested_at";
    `);
  }
}
