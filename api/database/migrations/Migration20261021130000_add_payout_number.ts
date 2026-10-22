import { Migration } from '@mikro-orm/migrations';

/**
 * Gives Payouts a human-facing number, mirroring `orders.order_number`.
 *
 * Existing rows are numbered deterministically in UTC creation order by a
 * row-numbered backfill, then the sequence is seeded from the highest assigned
 * suffix so new Payouts continue after the backfill without reusing a number.
 */
export class Migration20261021130000_add_payout_number extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "payouts" add column "payout_number" varchar(25) null;
    `);

    this.addSql(`
      update "payouts" p
      set "payout_number" = numbered."payout_number"
      from (
        select "id",
               concat(
                 'PAY-',
                 to_char(timezone('UTC', "created_at"), 'YYYYMMDD'),
                 '-',
                 lpad(row_number() over (order by "created_at", "id")::text, 6, '0')
               ) as "payout_number"
        from "payouts"
      ) numbered
      where p."id" = numbered."id";
    `);

    this.addSql(`
      alter table "payouts" alter column "payout_number" set not null;
    `);

    this.addSql(`
      create unique index "payouts_payout_number_unique"
        on "payouts" ("payout_number");
    `);

    this.addSql(`
      create sequence if not exists "payouts_payout_number_seq";
    `);

    this.addSql(`
      create or replace function set_payout_number()
      returns trigger as $$
      begin
        if new.payout_number is null then
          new.payout_number := concat(
            'PAY-',
            to_char(timezone('UTC', coalesce(new.created_at, now())), 'YYYYMMDD'),
            '-',
            lpad(nextval('payouts_payout_number_seq')::text, 6, '0')
          );
        end if;

        return new;
      end;
      $$ language plpgsql;
    `);

    this.addSql(`
      drop trigger if exists "payouts_set_payout_number" on "payouts";
    `);

    this.addSql(`
      create trigger "payouts_set_payout_number"
      before insert on "payouts"
      for each row
      execute function set_payout_number();
    `);

    this.addSql(`
      select setval(
        'payouts_payout_number_seq',
        greatest(
          coalesce((
            select max((regexp_match("payout_number", '([0-9]+)$'))[1]::bigint)
            from "payouts"
            where "payout_number" ~ '^PAY-[0-9]{8}-[0-9]+$'
          ), 0),
          1
        ),
        true
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      drop trigger if exists "payouts_set_payout_number" on "payouts";
    `);

    this.addSql(`
      drop function if exists set_payout_number();
    `);

    this.addSql(`
      drop sequence if exists "payouts_payout_number_seq";
    `);

    this.addSql(`
      drop index if exists "payouts_payout_number_unique";
    `);

    this.addSql(`
      alter table "payouts" drop column if exists "payout_number";
    `);
  }
}
