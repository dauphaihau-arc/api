import { Migration } from '@mikro-orm/migrations';

/**
 * The monthly payout schedule: each shop opts in to automatic payouts, and both
 * an automatic run and a manual withdrawal may claim at most one Payout per
 * platform month. The old unique key on `(shop_id, run_day)` is replaced by
 * partial unique indexes per source so the two allowances stay independent.
 */
export class Migration20261020130000_add_payout_schedule extends Migration {
  override async up(): Promise<void> {
    // A missing row means "not opted in": automatic runs only pay shops that do.
    this.addSql(`
      create table "payout_settings" (
        "shop_id" uuid not null,
        "auto_payout_enabled" boolean not null default false,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "payout_settings_pkey" primary key ("shop_id")
      );
    `);
    this.addSql(`
      alter table "payout_settings"
        add column "auto_payout_enabled_at" timestamptz null;
    `);
    this.addSql(`
      alter table "payout_settings"
        add constraint "payout_settings_shop_id_foreign"
        foreign key ("shop_id") references "shops" ("id")
        on update cascade on delete restrict;
    `);

    // Historical rows keep `period_key` null and are therefore outside both
    // monthly allowances.
    this.addSql(`
      alter table "payouts"
        add column "source" varchar(16) not null default 'scheduled';
    `);
    this.addSql(`
      alter table "payouts"
        add column "period_key" varchar(7) null;
    `);
    this.addSql(`
      alter table "payouts"
        add column "quota_consumed" boolean not null default true;
    `);
    this.addSql(`
      alter table "payouts"
        add column "requested_by_user_id" uuid null;
    `);
    this.addSql(`
      alter table "payouts"
        add constraint "payouts_requested_by_user_id_foreign"
        foreign key ("requested_by_user_id") references "users" ("id")
        on update cascade on delete restrict;
    `);

    // Paying once per platform month replaces paying once per platform day.
    this.addSql(`
      alter table "payouts"
        drop constraint "payouts_shop_id_run_day_unique";
    `);
    this.addSql(`
      create unique index "payouts_scheduled_period_unique"
        on "payouts" ("shop_id", "period_key")
        where "source" = 'scheduled'
          and "quota_consumed"
          and "period_key" is not null;
    `);
    this.addSql(`
      create unique index "payouts_manual_period_unique"
        on "payouts" ("shop_id", "period_key")
        where "source" = 'manual'
          and "quota_consumed"
          and "period_key" is not null;
    `);
    this.addSql(`
      create index "payouts_shop_id_source_period_key_index"
        on "payouts" ("shop_id", "source", "period_key");
    `);
    // One unresolved transfer per shop, whatever created it. This is the backstop
    // behind the claim's `not exists (pending)` guard: two concurrent claims for
    // one shop cannot both insert a pending row.
    this.addSql(`
      create unique index "payouts_one_pending_per_shop"
        on "payouts" ("shop_id")
        where "state" = 'pending';
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop index if exists "payouts_one_pending_per_shop";');
    this.addSql(`
      drop index if exists "payouts_shop_id_source_period_key_index";
    `);
    this.addSql('drop index if exists "payouts_manual_period_unique";');
    this.addSql('drop index if exists "payouts_scheduled_period_unique";');

    // The old key cannot hold a month of Payouts. Restore it only when the data
    // still fits, and leave the table without it rather than deleting history.
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1
          from "payouts"
          group by "shop_id", "run_day"
          having count(*) > 1
        ) then
          alter table "payouts"
            add constraint "payouts_shop_id_run_day_unique"
            unique ("shop_id", "run_day");
        end if;
      end
      $$;
    `);

    this.addSql(`
      alter table "payouts"
        drop constraint "payouts_requested_by_user_id_foreign";
    `);
    this.addSql('alter table "payouts" drop column "requested_by_user_id";');
    this.addSql('alter table "payouts" drop column "quota_consumed";');
    this.addSql('alter table "payouts" drop column "period_key";');
    this.addSql('alter table "payouts" drop column "source";');
    this.addSql('drop table if exists "payout_settings" cascade;');
  }
}
