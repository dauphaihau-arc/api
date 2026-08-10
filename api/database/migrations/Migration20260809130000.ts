import { Migration } from '@mikro-orm/migrations';

export class Migration20260809130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      insert into "chat_messages" (
        "id",
        "created_at",
        "updated_at",
        "conversation_id",
        "sender_user_id",
        "message_type",
        "body",
        "metadata",
        "edited_at"
      )
      select
        gen_random_uuid(),
        conversation."created_at" - interval '1 millisecond',
        conversation."created_at" - interval '1 millisecond',
        conversation."id",
        conversation."buyer_user_id",
        'product_reference',
        product."title",
        jsonb_build_object(
          'product_reference',
          jsonb_build_object(
            'product_id', product."id",
            'snapshot', jsonb_strip_nulls(jsonb_build_object(
              'title', product."title",
              'shop_slug', shop."slug",
              'product_slug', product."slug",
              'image_storage_key', coalesce(card_image_variant."storage_key", primary_image."storage_key"),
              'amount_minor', lowest_price."amount_minor",
              'original_amount_minor', lowest_price."original_amount_minor",
              'currency', lowest_price."currency"
            )),
            'current', jsonb_build_object(
              'status', product."state",
              'in_stock', coalesce(stock_summary."stock", 0) > 0,
              'stock', coalesce(stock_summary."stock", 0)
            )
          )
        ),
        null
      from "chat_conversations" as conversation
      join "products" as product
        on product."id" = conversation."product_id"
      join "shops" as shop
        on shop."id" = product."shop_id"
      left join lateral (
        select image."id", image."storage_key"
        from "product_images" as image
        where image."product_id" = product."id"
        order by image."rank" asc
        limit 1
      ) as primary_image on true
      left join lateral (
        select image_variant."storage_key"
        from "product_image_variants" as image_variant
        where image_variant."product_image_id" = primary_image."id"
          and image_variant."variant" = 'card_1x1'
        limit 1
      ) as card_image_variant on true
      left join lateral (
        select price."amount_minor", price."original_amount_minor", price."currency"
        from "product_inventory" as inventory
        join "variant_prices" as price
          on price."product_inventory_id" = inventory."id"
        where inventory."product_id" = product."id"
          and price."active_to" is null
        order by price."amount_minor" asc
        limit 1
      ) as lowest_price on true
      left join lateral (
        select sum(inventory."stock")::int as "stock"
        from "product_inventory" as inventory
        where inventory."product_id" = product."id"
      ) as stock_summary on true
      where conversation."product_id" is not null
        and not exists (
          select 1
          from "chat_messages" as message
          where message."conversation_id" = conversation."id"
            and message."message_type" = 'product_reference'
            and message."metadata"->'product_reference'->>'product_id' = product."id"::text
        );
    `);

    this.addSql(`
      with latest_messages as (
        select distinct on ("conversation_id")
          "conversation_id",
          "id",
          "body",
          "message_type",
          "created_at",
          "updated_at",
          "sender_user_id"
        from "chat_messages"
        order by "conversation_id", "created_at" desc, "id" desc
      )
      update "chat_conversations" as conversation
      set
        "last_message_id" = latest_message."id",
        "last_message_body_preview" = left(latest_message."body", 160),
        "last_message_type" = latest_message."message_type",
        "last_message_at" = latest_message."created_at",
        "last_message_sender_user_id" = latest_message."sender_user_id",
        "updated_at" = greatest(conversation."updated_at", latest_message."updated_at")
      from latest_messages as latest_message
      where latest_message."conversation_id" = conversation."id"
        and conversation."last_message_id" is null;
    `);

    this.addSql(`
      alter table "chat_conversations"
        drop constraint if exists "chat_conversations_product_id_foreign";
    `);

    this.addSql('drop index if exists "chat_conversations_product_id_index";');

    this.addSql(`
      alter table "chat_conversations"
        drop column if exists "product_id";
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "chat_conversations"
        add column "product_id" uuid null;
    `);

    this.addSql(`
      create index if not exists "chat_conversations_product_id_index"
      on "chat_conversations" ("product_id");
    `);

    this.addSql(`
      alter table "chat_conversations"
        add constraint "chat_conversations_product_id_foreign"
        foreign key ("product_id") references "products" ("id")
        on update cascade on delete set null;
    `);
  }
}
