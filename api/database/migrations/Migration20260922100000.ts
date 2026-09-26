import { Migration } from '@mikro-orm/migrations';

/**
 * Confirmed Orders now carry the accepted shipping facts instead of a
 * fabricated delivery date.
 *
 * `orders.shipping_quote_snapshot` freezes the per-shop Shipping Charge
 * calculation, matched Shipping Profile/rate identities and versions, the
 * Processing/Delivery ranges, the combined estimate, and any shipping waiver
 * that the buyer accepted. Later Product reassignment or profile/rate edits
 * cannot rewrite it, and shipment splitting never adds a charge.
 *
 * `orders.shipping_estimated_delivery` is now the accepted estimate's latest
 * delivery date, so it becomes nullable: an Order without an accepted shipping
 * estimate stores no date rather than a fabricated one. Existing rows keep
 * their historical value and are never rewritten.
 */
export class Migration20260922100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "orders" add column "shipping_quote_snapshot" jsonb null;');
    this.addSql('alter table "orders" alter column "shipping_estimated_delivery" drop not null;');
  }

  override async down(): Promise<void> {
    throw new Error('Migration20260922100000 is forward-only: accepted Order shipping facts and historical delivery estimates must be preserved.');
  }
}
