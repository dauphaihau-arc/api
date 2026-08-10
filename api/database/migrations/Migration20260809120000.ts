import { Migration } from '@mikro-orm/migrations';

export class Migration20260809120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "chat_conversations"
        add column "last_message_id" uuid null,
        add column "last_message_body_preview" varchar(160) null,
        add column "last_message_type" varchar(20) null,
        add column "buyer_unread_count" int not null default 0,
        add column "seller_unread_count" int not null default 0;
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
      where latest_message."conversation_id" = conversation."id";
    `);

    this.addSql(`
      update "chat_conversations" as conversation
      set "buyer_unread_count" = unread_counts."total"
      from (
        select
          conversation_for_count."id" as "conversation_id",
          count(message."id")::int as "total"
        from "chat_conversations" as conversation_for_count
        join "chat_messages" as message
          on message."conversation_id" = conversation_for_count."id"
        where message."sender_user_id" <> conversation_for_count."buyer_user_id"
          and (
            conversation_for_count."buyer_last_read_at" is null
            or conversation_for_count."buyer_last_read_at" < message."created_at"
          )
        group by conversation_for_count."id"
      ) as unread_counts
      where unread_counts."conversation_id" = conversation."id";
    `);

    this.addSql(`
      update "chat_conversations" as conversation
      set "seller_unread_count" = unread_counts."total"
      from (
        select
          conversation_for_count."id" as "conversation_id",
          count(message."id")::int as "total"
        from "chat_conversations" as conversation_for_count
        join "shops" as shop
          on shop."id" = conversation_for_count."shop_id"
        join "chat_messages" as message
          on message."conversation_id" = conversation_for_count."id"
        where message."sender_user_id" <> shop."owner_user_id"
          and (
            conversation_for_count."seller_last_read_at" is null
            or conversation_for_count."seller_last_read_at" < message."created_at"
          )
        group by conversation_for_count."id"
      ) as unread_counts
      where unread_counts."conversation_id" = conversation."id";
    `);

    this.addSql(`
      create index "chat_conversations_last_message_id_index"
        on "chat_conversations" ("last_message_id");
    `);

    this.addSql(`
      create index "chat_conversations_buyer_unread_count_index"
        on "chat_conversations" ("buyer_user_id", "buyer_unread_count");
    `);

    this.addSql(`
      create index "chat_conversations_seller_unread_count_index"
        on "chat_conversations" ("shop_id", "seller_unread_count");
    `);

    this.addSql(`
      alter table "chat_conversations"
        add constraint "chat_conversations_last_message_id_foreign"
        foreign key ("last_message_id") references "chat_messages" ("id")
        on update cascade on delete set null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "chat_conversations"
        drop constraint if exists "chat_conversations_last_message_id_foreign";
    `);

    this.addSql('drop index if exists "chat_conversations_last_message_id_index";');
    this.addSql('drop index if exists "chat_conversations_buyer_unread_count_index";');
    this.addSql('drop index if exists "chat_conversations_seller_unread_count_index";');

    this.addSql(`
      alter table "chat_conversations"
        drop column if exists "last_message_id",
        drop column if exists "last_message_body_preview",
        drop column if exists "last_message_type",
        drop column if exists "buyer_unread_count",
        drop column if exists "seller_unread_count";
    `);
  }
}
