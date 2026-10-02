import { Migration } from '@mikro-orm/migrations';

/**
 * Sale savings recorded separately from the Checkout Discount a Promo Code
 * grants.
 *
 * `discount_minor` stays the Promo Code discount; `sale_discount_minor` is the
 * reduction already reflected in the priced merchandise (the highest matching
 * Sale percentage applied to the regular price). Keeping them apart lets
 * checkout and Order history explain the two savings independently instead of
 * one unexplained adjustment. Both quote and Order retain the split, so an
 * accepted quote and the committed Order agree.
 */
export class Migration20261001112519_add_order_sale_discount extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'alter table "orders" add column "sale_discount_minor" int not null default 0;',
    );
    this.addSql(
      'alter table "checkout_quotes" add column "sale_discount_minor" int not null default 0;',
    );
  }

  override async down(): Promise<void> {
    this.addSql('alter table "checkout_quotes" drop column if exists "sale_discount_minor";');
    this.addSql('alter table "orders" drop column if exists "sale_discount_minor";');
  }
}
