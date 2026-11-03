import { Migration } from '@mikro-orm/migrations';

/**
 * Labels bought from a carrier. Each row belongs to exactly one prepared
 * Shipment (unique `shipment_id`) and freezes the carrier's purchase evidence:
 * the quote it came from, the tracking number, the price, and where the PDF is
 * stored. The label is a sibling of the Shipment, not a replacement for it:
 * carrier and tracking are mirrored onto the Shipment so handover and carrier
 * events keep resolving by `(carrier, tracking_number)`.
 */
export class Migration20261102120000_add_shipment_labels extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "shipment_labels" (
        "id" uuid not null,
        "created_at" timestamptz(6) not null,
        "updated_at" timestamptz(6) not null,
        "public_id" varchar(32) not null,
        "shipment_id" uuid not null,
        "order_id" uuid not null,
        "shop_id" uuid not null,
        "carrier" varchar(255) not null,
        "service" varchar(255) not null,
        "quote_id" varchar(255) not null,
        "tracking_number" varchar(255) not null,
        "price_minor" int not null,
        "currency" varchar(3) not null,
        "pdf_storage_key" varchar(512) not null,
        "status" varchar(30) not null default 'purchased',
        constraint "shipment_labels_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      alter table "shipment_labels"
        add constraint "shipment_labels_shipment_id_foreign"
        foreign key ("shipment_id") references "shipments" ("id")
        on update cascade on delete cascade;
    `);

    this.addSql(`
      alter table "shipment_labels"
        add constraint "shipment_labels_public_id_unique" unique ("public_id");
    `);

    this.addSql(`
      alter table "shipment_labels"
        add constraint "shipment_labels_shipment_id_unique" unique ("shipment_id");
    `);

    this.addSql('create index "shipment_labels_order_id_index" on "shipment_labels" ("order_id");');
    this.addSql('create index "shipment_labels_shop_id_index" on "shipment_labels" ("shop_id");');
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "shipment_labels" cascade;');
  }
}
