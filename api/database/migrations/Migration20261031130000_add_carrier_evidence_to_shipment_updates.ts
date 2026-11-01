import { Migration } from '@mikro-orm/migrations';

/**
 * Carrier Evidence on the Shipment timeline. `carrier_event_id` makes a
 * carrier's event id idempotent per carrier, `event_code` keeps the carrier's own code and
 * `location` the reported place, so a timeline can be reconstructed without
 * reinterpreting a status. Existing seller and system updates keep all three
 * columns as NULL: their evidence predates carriers and is never backfilled.
 */
export class Migration20261031130000_add_carrier_evidence_to_shipment_updates extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "shipment_updates"
        add column "carrier_event_id" varchar(255) null,
        add column "event_code" varchar(64) null,
        add column "location" varchar(255) null;
    `);

    // A repeated event id from the same carrier is the same evidence, so it must
    // not insert twice. Event ids are unique per carrier, not globally: two
    // carriers may legitimately reuse an id. The index is partial because seller
    // and system updates carry no event id.
    this.addSql(`
      create unique index "shipment_updates_carrier_event_unique"
        on "shipment_updates" ("actor_id", "carrier_event_id")
        where "carrier_event_id" is not null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop index if exists "shipment_updates_carrier_event_unique";');
    this.addSql(`
      alter table "shipment_updates"
        drop column if exists "carrier_event_id",
        drop column if exists "event_code",
        drop column if exists "location";
    `);
  }
}
