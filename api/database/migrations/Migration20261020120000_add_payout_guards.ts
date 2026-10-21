import { Migration } from '@mikro-orm/migrations';

export class Migration20261020120000_add_payout_guards extends Migration {
  override async up(): Promise<void> {
    // A Blocked Payout has no usable account to point at, and records why it was
    // blocked so sellers and operators can tell it apart from a failure.
    this.addSql(`
      alter table "payouts"
        alter column "payout_account_id" drop not null;
    `);
    this.addSql(`
      alter table "payouts"
        add column "reason" varchar(64) null;
    `);

    // A netted negative balance can discharge an Order across several Payouts,
    // so the unique key moves from the Order alone to the Payout's line.
    this.addSql(`
      alter table "payout_lines"
        drop constraint "payout_lines_order_id_unique";
    `);
    this.addSql(`
      alter table "payout_lines"
        add constraint "payout_lines_payout_id_order_id_unique"
        unique ("payout_id", "order_id");
    `);
    this.addSql(`
      create index "payout_lines_order_id_index"
        on "payout_lines" ("order_id");
    `);
  }

  override async down(): Promise<void> {
    // Multiple Payout lines for one Order are valid from here on, so the old
    // one-discharge unique key can only come back when the data still fits it.
    // A partial reversal is worse than none, so the whole lines reversal is
    // skipped together and the forward schema stays usable.
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1 from "payout_lines" group by "order_id" having count(*) > 1
        ) then
          alter table "payout_lines"
            drop constraint "payout_lines_payout_id_order_id_unique";
          alter table "payout_lines"
            add constraint "payout_lines_order_id_unique" unique ("order_id");
          drop index if exists "payout_lines_order_id_index";
        else
          raise notice 'payout_lines keeps its (payout_id, order_id) unique key: an order has more than one payout line';
        end if;
      end
      $$;
    `);

    // Blocked Payouts have no account to point at and record why. Both the
    // not-null constraint and the reason column belong to that shape, so they
    // are reversed only when no blocked row exists.
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1 from "payouts" where "payout_account_id" is null
        ) then
          alter table "payouts" drop column "reason";
          alter table "payouts"
            alter column "payout_account_id" set not null;
        else
          raise notice 'payouts keeps payout_account_id nullable and reason: blocked payouts exist';
        end if;
      end
      $$;
    `);
  }
}
