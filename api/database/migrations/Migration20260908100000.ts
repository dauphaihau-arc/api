import { Migration } from '@mikro-orm/migrations';

export class Migration20260908100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      do $$
      declare
        duplicate_option record;
        duplicate_value record;
        duplicate_combination record;
        missing_inventory record;
        multiple_inventory record;
      begin
        select product_id, position, normalized_name, count(*) into duplicate_option
        from (
          select id as product_id, 1 as position, lower(trim(variant_group_name)) as normalized_name
          from products
          where variant_group_name is not null
          union all
          select id as product_id, 2 as position, lower(trim(variant_sub_group_name)) as normalized_name
          from products
          where variant_sub_group_name is not null
        ) option_rows
        group by product_id, position, normalized_name
        having count(*) > 1
        limit 1;
        if duplicate_option.product_id is not null then
          raise exception 'product option normalization preflight failed: duplicate normalized option label for product %, option position %, label %', duplicate_option.product_id, duplicate_option.position, duplicate_option.normalized_name;
        end if;

        select product_id, position, normalized_value, count(*) into duplicate_value
        from (
          select product_id, 1 as position, option_value_1 as raw_value, lower(trim(option_value_1)) as normalized_value
          from product_variants
          where option_value_1 is not null
          union all
          select product_id, 2 as position, option_value_2 as raw_value, lower(trim(option_value_2)) as normalized_value
          from product_variants
          where option_value_2 is not null
        ) value_rows
        group by product_id, position, normalized_value
        having count(distinct raw_value) > 1
        limit 1;
        if duplicate_value.product_id is not null then
          raise exception 'product option normalization preflight failed: ambiguous normalized option value for product %, option position %, value %', duplicate_value.product_id, duplicate_value.position, duplicate_value.normalized_value;
        end if;

        select product_id, coalesce(lower(trim(option_value_1)), '__default__') as value_1, coalesce(lower(trim(option_value_2)), '__none__') as value_2, count(*) into duplicate_combination
        from product_variants
        where lifecycle_state <> 'removed'
        group by product_id, coalesce(lower(trim(option_value_1)), '__default__'), coalesce(lower(trim(option_value_2)), '__none__')
        having count(*) > 1
        limit 1;
        if duplicate_combination.product_id is not null then
          raise exception 'product option normalization preflight failed: duplicate active variant combination for product %, values %, %', duplicate_combination.product_id, duplicate_combination.value_1, duplicate_combination.value_2;
        end if;

        select pv.id as product_variant_id into missing_inventory
        from product_variants pv
        left join product_inventory pi on pi.product_variant_id = pv.id and pi.lifecycle_state <> 'removed'
        where pv.lifecycle_state <> 'removed' and pi.id is null
        limit 1;
        if missing_inventory.product_variant_id is not null then
          raise exception 'product option normalization preflight failed: active variant % has no active inventory item', missing_inventory.product_variant_id;
        end if;

        select inventory_owner_id as product_variant_id, count(*) into multiple_inventory
        from (
          select coalesce(product_variant_id, product_id) as inventory_owner_id
          from product_inventory
          where lifecycle_state <> 'removed'
        ) active_inventory
        group by inventory_owner_id
        having count(*) > 1
        limit 1;
        if multiple_inventory.product_variant_id is not null then
          raise exception 'product option normalization preflight failed: variant % has % active inventory items', multiple_inventory.product_variant_id, multiple_inventory.count;
        end if;
      end $$;
    `);

    this.addSql('create table "product_options" ("id" uuid not null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "product_id" uuid not null, "name" varchar(255) not null, "normalized_name" varchar(255) not null, "position" int not null, "removed_at" timestamptz(6) null, constraint "product_options_pkey" primary key ("id"));');
    this.addSql('create table "product_option_values" ("id" uuid not null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "product_option_id" uuid not null, "value" varchar(255) not null, "normalized_value" varchar(255) not null, "position" int not null, "removed_at" timestamptz(6) null, constraint "product_option_values_pkey" primary key ("id"));');
    this.addSql('alter table "product_variants" add column "combination_key" text null;');
    this.addSql('create table "product_variant_option_values" ("product_id" uuid not null, "product_variant_id" uuid not null, "product_option_id" uuid not null, "product_option_value_id" uuid not null, constraint "product_variant_option_values_pkey" primary key ("product_variant_id", "product_option_id"));');

    this.addSql('alter table "product_options" add constraint "product_options_product_id_foreign" foreign key ("product_id") references "products" ("id") on update cascade on delete cascade;');
    this.addSql('alter table "product_option_values" add constraint "product_option_values_product_option_id_foreign" foreign key ("product_option_id") references "product_options" ("id") on update cascade on delete cascade;');

    this.addSql(`
      insert into product_options (id, created_at, updated_at, product_id, name, normalized_name, position)
      select gen_random_uuid(), now(), now(), product_id, option_name, lower(trim(option_name)), position
      from (
        select distinct id as product_id, variant_group_name as option_name, 1 as position
        from products
        where variant_group_name is not null
        union all
        select distinct id as product_id, variant_sub_group_name as option_name, 2 as position
        from products
        where variant_sub_group_name is not null
      ) option_rows;
    `);
    this.addSql(`
      insert into product_option_values (id, created_at, updated_at, product_option_id, value, normalized_value, position)
      select gen_random_uuid(), now(), now(), id, value, lower(trim(value)), position
      from (
        select po.id, pv.option_value_1 as value, dense_rank() over (partition by po.id order by lower(trim(pv.option_value_1))) as position
        from product_variants pv
        join product_options po on po.product_id = pv.product_id and po.position = 1
        where pv.option_value_1 is not null
        group by po.id, pv.option_value_1
        union all
        select po.id, pv.option_value_2 as value, dense_rank() over (partition by po.id order by lower(trim(pv.option_value_2))) as position
        from product_variants pv
        join product_options po on po.product_id = pv.product_id and po.position = 2
        where pv.option_value_2 is not null
        group by po.id, pv.option_value_2
      ) value_rows;
    `);
    this.addSql(`
      insert into product_variants (id, created_at, updated_at, product_id, name, rank, lifecycle_state, combination_key)
      select gen_random_uuid(), now(), now(), direct_inventory.product_id, 'Default', 1, 'active', '__default__'
      from (select distinct product_id from product_inventory where product_variant_id is null) direct_inventory;
    `);
    this.addSql(`
      update product_inventory pi
      set product_variant_id = pv.id
      from product_variants pv
      where pi.product_variant_id is null
        
        and pv.product_id = pi.product_id
        and pv.combination_key = '__default__';
    `);
    this.addSql(`
      insert into product_variant_option_values (product_id, product_variant_id, product_option_id, product_option_value_id)
      select pv.product_id, pv.id, po.id, pov.id
      from product_variants pv
      join product_options po on po.product_id = pv.product_id and po.position = 1
      join product_option_values pov on pov.product_option_id = po.id and pov.normalized_value = lower(trim(pv.option_value_1))
      where pv.option_value_1 is not null;
    `);
    this.addSql(`
      insert into product_variant_option_values (product_id, product_variant_id, product_option_id, product_option_value_id)
      select pv.product_id, pv.id, po.id, pov.id
      from product_variants pv
      join product_options po on po.product_id = pv.product_id and po.position = 2
      join product_option_values pov on pov.product_option_id = po.id and pov.normalized_value = lower(trim(pv.option_value_2))
      where pv.option_value_2 is not null;
    `);
    this.addSql(`
      update product_variants pv
      set combination_key = coalesce(selection_rows.combination_key, '__default__')
      from (
        select product_variant_id, string_agg(product_option_value_id::text, '|' order by product_option_value_id::text) as combination_key
        from product_variant_option_values
        group by product_variant_id
      ) selection_rows
      where selection_rows.product_variant_id = pv.id;
    `);
    this.addSql('update product_variants set combination_key = \'__default__\' where combination_key is null;');
    this.addSql('alter table "product_variants" alter column "combination_key" set not null;');
    this.addSql('alter table "product_inventory" alter column "product_variant_id" set not null;');
    this.addSql('alter table "checkout_quote_items" add column "selected_options" json null;');
    this.addSql('alter table "order_items" add column "selected_options" json null;');

    this.addSql('alter table "product_options" add constraint "product_options_id_product_id_unique" unique ("id", "product_id");');
    this.addSql('alter table "product_option_values" add constraint "product_option_values_id_option_id_unique" unique ("id", "product_option_id");');
    this.addSql('alter table "product_variants" add constraint "product_variants_id_product_id_unique" unique ("id", "product_id");');
    this.addSql('alter table "product_variant_option_values" add constraint "product_variant_option_values_product_variant_product_foreign" foreign key ("product_variant_id", "product_id") references "product_variants" ("id", "product_id") on update cascade on delete cascade;');
    this.addSql('alter table "product_variant_option_values" add constraint "product_variant_option_values_product_option_product_foreign" foreign key ("product_option_id", "product_id") references "product_options" ("id", "product_id") on update cascade on delete cascade;');
    this.addSql('alter table "product_variant_option_values" add constraint "product_variant_option_values_value_option_foreign" foreign key ("product_option_value_id", "product_option_id") references "product_option_values" ("id", "product_option_id") on update cascade on delete restrict;');

    this.addSql('create index "product_options_product_id_index" on "product_options" ("product_id");');
    this.addSql('create unique index "product_options_product_normalized_name_not_removed_unique" on "product_options" ("product_id", "normalized_name") where "removed_at" is null;');
    this.addSql('create index "product_option_values_product_option_id_index" on "product_option_values" ("product_option_id");');
    this.addSql('create unique index "product_option_values_option_normalized_value_not_removed_unique" on "product_option_values" ("product_option_id", "normalized_value") where "removed_at" is null;');
    this.addSql('create index "product_variant_option_values_product_id_index" on "product_variant_option_values" ("product_id");');
    this.addSql('create index "product_variant_option_values_option_id_index" on "product_variant_option_values" ("product_option_id");');
    this.addSql('create index "product_variant_option_values_value_id_index" on "product_variant_option_values" ("product_option_value_id");');
    this.addSql('create unique index "product_variants_product_combination_not_removed_unique" on "product_variants" ("product_id", "combination_key") where "removed_at" is null;');
    this.addSql('create unique index "product_inventory_product_variant_not_removed_unique" on "product_inventory" ("product_variant_id") where "lifecycle_state" <> \'removed\';');

    this.addSql('alter table "products" drop column "variant_type";');
    this.addSql('alter table "products" drop column "variant_group_name";');
    this.addSql('alter table "products" drop column "variant_sub_group_name";');
    this.addSql('alter table "product_variants" drop column "option_value_1";');
    this.addSql('alter table "product_variants" drop column "option_value_2";');
    this.addSql('alter table "product_variants" drop column "name";');
    this.addSql('alter table "checkout_quote_items" drop column if exists "variant_group_name";');
    this.addSql('alter table "checkout_quote_items" drop column if exists "variant_sub_group_name";');
    this.addSql('alter table "checkout_quote_items" drop column if exists "variant_name";');
    this.addSql('alter table "checkout_quote_items" drop column if exists "variant_labels";');
    this.addSql('alter table "order_items" drop column if exists "variant_group_name";');
    this.addSql('alter table "order_items" drop column if exists "variant_sub_group_name";');
    this.addSql('alter table "order_items" drop column if exists "variant_name";');
    this.addSql('alter table "order_items" drop column if exists "variant_labels";');
  }

  override async down(): Promise<void> {
    throw new Error('Migration20260908100000 is forward-only: Product Option normalization preserves inventory identities and removed selection history.');
  }
}
