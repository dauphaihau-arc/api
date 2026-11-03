import { Migration } from '@mikro-orm/migrations';

/**
 * The carrier's own id for a purchased label. Refunding the label at the
 * carrier must address the carrier's id; the local public id keeps serving as
 * the seller-facing identifier.
 */
export class Migration20261103120000_add_shipment_label_carrier_id extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "shipment_labels"
        add column "carrier_label_id" varchar(64) not null default '';
    `);
  }

  override async down(): Promise<void> {
    this.addSql('alter table "shipment_labels" drop column "carrier_label_id";');
  }
}
