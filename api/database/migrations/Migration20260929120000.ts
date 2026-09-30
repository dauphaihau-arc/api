import { Migration } from '@mikro-orm/migrations';

/**
 * Coupons gain a visibility so the shopper-facing listing can offer only the
 * Coupons a seller intends buyers to discover.
 *
 * `visibility` is `'public'` for Coupons a seller exposes in the checkout
 * coupon listing and `'code_only'` for Coupons redeemable only when a buyer
 * already holds the code. Every Coupon that exists before this migration is
 * code-only: nothing becomes discoverable without an explicit seller choice.
 */
export class Migration20260929120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "coupons" add column "visibility" varchar(20) null;');
    this.addSql('update "coupons" set "visibility" = \'code_only\' where "visibility" is null;');
    this.addSql('alter table "coupons" alter column "visibility" set not null;');
    this.addSql('alter table "coupons" alter column "visibility" set default \'code_only\';');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "coupons" drop column "visibility";');
  }
}
