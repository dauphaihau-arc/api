import { Migration } from '@mikro-orm/migrations';

export class Migration20260602180000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create sequence if not exists "orders_order_number_seq";
    `);

    this.addSql(`
      create or replace function set_order_number()
      returns trigger as $$
      begin
        if new.order_number is null then
          new.order_number := concat(
            'ORD-',
            to_char(timezone('UTC', coalesce(new.created_at, now())), 'YYYYMMDD'),
            '-',
            lpad(nextval('orders_order_number_seq')::text, 6, '0')
          );
        end if;

        return new;
      end;
      $$ language plpgsql;
    `);

    this.addSql(`
      drop trigger if exists "orders_set_order_number" on "orders";
    `);

    this.addSql(`
      create trigger "orders_set_order_number"
      before insert on "orders"
      for each row
      execute function set_order_number();
    `);

    this.addSql(`
      select setval(
        'orders_order_number_seq',
        greatest(
          coalesce((
            select max((regexp_match("order_number", '([0-9]+)$'))[1]::bigint)
            from "orders"
            where "order_number" ~ '^ORD-[0-9]{8}-[0-9]+$'
          ), 0),
          1
        ),
        true
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      drop trigger if exists "orders_set_order_number" on "orders";
    `);

    this.addSql(`
      drop function if exists set_order_number();
    `);

    this.addSql(`
      drop sequence if exists "orders_order_number_seq";
    `);
  }
}
