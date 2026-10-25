import { Migration } from '@mikro-orm/migrations';

/**
 * Turns `payout_accounts` from a self-managed bank record into a pointer at a
 * payment provider's connected account.
 *
 * Bank data is destroyed on purpose: the column set no longer has anywhere to
 * put a reference, holder name, bank name or last four, and the verification
 * instant disappears with the operator verification flow. Rows keep their shop,
 * provider, country, currency and status so existing Payouts still resolve the
 * account they paid.
 */
export class Migration20261024120000_convert_payout_accounts_to_connect extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "payout_accounts"
        add column "provider_account_id" varchar(255) null,
        add column "payouts_enabled" boolean not null default false,
        add column "charges_enabled" boolean not null default false,
        add column "transfers_capability" varchar(32) null,
        add column "requirements" jsonb null,
        add column "default_currency" varchar(3) null;
    `);

    // `pending` was "recorded, waiting for an operator". There is no operator
    // step any more, so such a row is waiting for the seller at Stripe.
    this.addSql(`
      update "payout_accounts"
      set "status" = 'onboarding'
      where "status" = 'pending';
    `);

    // The local adapter has no upstream capability report; an active local row
    // is fully capable by definition, which keeps the read shape coherent.
    this.addSql(`
      update "payout_accounts"
      set "payouts_enabled" = true,
          "charges_enabled" = true,
          "transfers_capability" = 'active',
          "default_currency" = "currency"
      where "provider" = 'manual_bank' and "status" = 'active';
    `);

    this.addSql(`
      alter table "payout_accounts"
        drop column "provider_ref_encrypted",
        drop column "holder_name",
        drop column "bank_name",
        drop column "last4",
        drop column "verified_at";
    `);

    this.addSql(`
      alter table "payout_accounts"
        alter column "status" set default 'onboarding';
    `);

    this.addSql(`
      alter table "payout_accounts"
        add constraint "payout_accounts_status_check"
        check ("status" in (
          'onboarding', 'action_required', 'active', 'restricted', 'disabled'
        ));
    `);

    this.addSql(`
      create unique index "payout_accounts_provider_account_id_unique"
        on "payout_accounts" ("provider_account_id");
    `);
  }

  override async down(): Promise<void> {
    // The bank columns come back empty: their contents are gone by design.
    this.addSql(`
      alter table "payout_accounts"
        drop constraint if exists "payout_accounts_status_check";
    `);

    this.addSql(`
      drop index if exists "payout_accounts_provider_account_id_unique";
    `);

    this.addSql(`
      alter table "payout_accounts"
        add column "provider_ref_encrypted" text null,
        add column "holder_name" varchar(255) null,
        add column "bank_name" varchar(255) null,
        add column "last4" varchar(4) null,
        add column "verified_at" timestamptz null;
    `);

    this.addSql(`
      alter table "payout_accounts"
        drop column "provider_account_id",
        drop column "payouts_enabled",
        drop column "charges_enabled",
        drop column "transfers_capability",
        drop column "requirements",
        drop column "default_currency";
    `);

    this.addSql(`
      update "payout_accounts"
      set "status" = 'pending'
      where "status" in ('onboarding', 'action_required');
    `);

    this.addSql(`
      update "payout_accounts"
      set "status" = 'disabled'
      where "status" = 'restricted';
    `);

    this.addSql(`
      alter table "payout_accounts"
        alter column "status" set default 'pending';
    `);
  }
}
