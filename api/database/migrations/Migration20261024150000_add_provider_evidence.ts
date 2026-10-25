import { Migration } from '@mikro-orm/migrations';

/**
 * The provider's transfer and connected-payout webhook reports, kept as
 * evidence for the reconciliation of platform transfers against Payouts.
 *
 * `provider_transfer_events` is append-only and keyed by the provider event id,
 * so a replayed webhook records nothing. Its `payout_id` is nullable because a
 * transfer event can arrive before the Payout's provider reference is stored;
 * reconciliation can still link the rows by `transfer_id`.
 *
 * `connected_payouts` is the only record of Stripe paying a connected account's
 * bank, which Arc does not schedule. It is upserted by provider payout id, so a
 * `failed` then `paid` report is one row. `provider_account_id` has no foreign
 * key on purpose: evidence for an account this deployment does not know is
 * still stored, since reconciliation needs the provider record itself.
 *
 * Neither table is part of the ledger: no posting, Payout state, or balance is
 * written from them.
 */
export class Migration20261024150000_add_provider_evidence extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "provider_transfer_events" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "provider_event_id" varchar(255) not null,
        "transfer_id" varchar(255) not null,
        "payout_id" uuid null,
        "status" varchar(16) not null,
        "amount_minor" int not null,
        "currency" varchar(3) not null,
        "reversed_amount_minor" int not null default 0,
        "destination_account_id" varchar(255) null,
        "occurred_at" timestamptz not null,
        constraint "provider_transfer_events_pkey" primary key ("id")
      );
    `);
    // One provider event, one evidence row: a replay inserts nothing.
    this.addSql(`
      alter table "provider_transfer_events"
        add constraint "provider_transfer_events_provider_event_id_unique"
        unique ("provider_event_id");
    `);
    this.addSql(`
      alter table "provider_transfer_events"
        add constraint "provider_transfer_events_status_check"
        check ("status" in ('created', 'updated', 'reversed'));
    `);
    this.addSql(`
      alter table "provider_transfer_events"
        add constraint "provider_transfer_events_amount_minor_check"
        check ("amount_minor" >= 0 and "reversed_amount_minor" >= 0);
    `);
    this.addSql(`
      create index "provider_transfer_events_transfer_id_index"
        on "provider_transfer_events" ("transfer_id");
    `);
    this.addSql(`
      create index "provider_transfer_events_payout_id_index"
        on "provider_transfer_events" ("payout_id");
    `);
    this.addSql(`
      create index "provider_transfer_events_occurred_at_index"
        on "provider_transfer_events" ("occurred_at");
    `);
    this.addSql(`
      alter table "provider_transfer_events"
        add constraint "provider_transfer_events_payout_id_foreign"
        foreign key ("payout_id") references "payouts" ("id")
        on update cascade on delete restrict;
    `);

    this.addSql(`
      create table "connected_payouts" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "provider_payout_id" varchar(255) not null,
        "provider_account_id" varchar(255) null,
        "status" varchar(16) not null,
        "amount_minor" int not null,
        "currency" varchar(3) not null,
        "arrival_date" date not null,
        "failure_code" varchar(255) null,
        "occurred_at" timestamptz not null,
        constraint "connected_payouts_pkey" primary key ("id")
      );
    `);
    // A connected payout is one provider fact: a second report updates the row.
    this.addSql(`
      alter table "connected_payouts"
        add constraint "connected_payouts_provider_payout_id_unique"
        unique ("provider_payout_id");
    `);
    this.addSql(`
      alter table "connected_payouts"
        add constraint "connected_payouts_status_check"
        check ("status" in ('paid', 'failed'));
    `);
    this.addSql(`
      alter table "connected_payouts"
        add constraint "connected_payouts_amount_minor_check"
        check ("amount_minor" >= 0);
    `);
    this.addSql(`
      create index "connected_payouts_provider_account_id_index"
        on "connected_payouts" ("provider_account_id");
    `);
    this.addSql(`
      create index "connected_payouts_occurred_at_index"
        on "connected_payouts" ("occurred_at");
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "connected_payouts" cascade;');
    this.addSql('drop table if exists "provider_transfer_events" cascade;');
  }
}
