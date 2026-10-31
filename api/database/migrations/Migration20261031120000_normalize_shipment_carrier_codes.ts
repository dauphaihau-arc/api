import { Migration } from '@mikro-orm/migrations';

/**
 * Shipments now store a catalogue carrier code (`usps`, `dhl`, `vnpost`,
 * `other`) instead of the free-text carrier a seller typed. A recorded value
 * keeps its code only when the stored tracking number still fits that provider's
 * pattern; a mismatch, an unknown carrier, or a tracking number with no carrier
 * becomes `other`, which accepts any number without claiming observability.
 * NULL and empty carrier values with no tracking number stay unchanged.
 */
export class Migration20261031120000_normalize_shipment_carrier_codes extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      update "shipments"
      set "carrier" = case
        when lower(trim("carrier")) = 'usps'
          and (
            "tracking_number" is null
            or trim("tracking_number") = ''
            or trim("tracking_number") ~ '^9[0-9]{21}$'
          ) then 'usps'
        when lower(trim("carrier")) = 'dhl'
          and (
            "tracking_number" is null
            or trim("tracking_number") = ''
            or trim("tracking_number") ~ '^[0-9]{10}$'
          ) then 'dhl'
        when lower(trim("carrier")) = 'vnpost'
          and (
            "tracking_number" is null
            or trim("tracking_number") = ''
            or trim("tracking_number") ~ '^[A-Z]{2}[0-9]{9}VN$'
          ) then 'vnpost'
        else 'other'
      end
      where "carrier" is not null
        and trim("carrier") <> '';
    `);

    // A number with no carrier cannot be validated anymore, so it is recorded
    // under `other` rather than stranding the Shipment at its next command.
    this.addSql(`
      update "shipments"
      set "carrier" = 'other'
      where ("carrier" is null or trim("carrier") = '')
        and "tracking_number" is not null
        and trim("tracking_number") <> '';
    `);
  }

  override async down(): Promise<void> {
    // The original free-text carrier is not recoverable from the mapped code;
    // restoring a guessed value would fabricate evidence.
  }
}
