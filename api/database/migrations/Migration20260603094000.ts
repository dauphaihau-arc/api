import { Migration } from '@mikro-orm/migrations';

export class Migration20260603094000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "chat_conversations" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "buyer_user_id" uuid not null,
        "shop_id" uuid not null,
        "product_id" uuid null,
        "status" varchar(20) not null default 'open',
        "last_message_at" timestamptz null,
        "last_message_sender_user_id" uuid null,
        "buyer_last_read_at" timestamptz null,
        "seller_last_read_at" timestamptz null,
        constraint "chat_conversations_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create index if not exists "chat_conversations_buyer_user_id_index"
      on "chat_conversations" ("buyer_user_id");
    `);

    this.addSql(`
      create index if not exists "chat_conversations_shop_id_index"
      on "chat_conversations" ("shop_id");
    `);

    this.addSql(`
      create index if not exists "chat_conversations_product_id_index"
      on "chat_conversations" ("product_id");
    `);

    this.addSql(`
      create index if not exists "chat_conversations_status_index"
      on "chat_conversations" ("status");
    `);

    this.addSql(`
      create index if not exists "chat_conversations_last_message_at_index"
      on "chat_conversations" ("last_message_at");
    `);

    this.addSql(`
      create index if not exists "chat_conversations_last_message_sender_user_id_index"
      on "chat_conversations" ("last_message_sender_user_id");
    `);

    this.addSql(`
      alter table "chat_conversations"
      add constraint "chat_conversations_buyer_user_id_foreign"
      foreign key ("buyer_user_id") references "users" ("id")
      on update cascade on delete cascade;
    `);

    this.addSql(`
      alter table "chat_conversations"
      add constraint "chat_conversations_shop_id_foreign"
      foreign key ("shop_id") references "shops" ("id")
      on update cascade on delete restrict;
    `);

    this.addSql(`
      alter table "chat_conversations"
      add constraint "chat_conversations_product_id_foreign"
      foreign key ("product_id") references "products" ("id")
      on update cascade on delete set null;
    `);

    this.addSql(`
      alter table "chat_conversations"
      add constraint "chat_conversations_last_message_sender_user_id_foreign"
      foreign key ("last_message_sender_user_id") references "users" ("id")
      on update cascade on delete set null;
    `);

    this.addSql(`
      create table if not exists "chat_messages" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "conversation_id" uuid not null,
        "sender_user_id" uuid not null,
        "message_type" varchar(20) not null default 'text',
        "body" text not null,
        "metadata" jsonb null,
        "edited_at" timestamptz null,
        constraint "chat_messages_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create index if not exists "chat_messages_conversation_created_at_index"
      on "chat_messages" ("conversation_id", "created_at");
    `);

    this.addSql(`
      create index if not exists "chat_messages_sender_user_id_index"
      on "chat_messages" ("sender_user_id");
    `);

    this.addSql(`
      create index if not exists "chat_messages_message_type_index"
      on "chat_messages" ("message_type");
    `);

    this.addSql(`
      alter table "chat_messages"
      add constraint "chat_messages_conversation_id_foreign"
      foreign key ("conversation_id") references "chat_conversations" ("id")
      on update cascade on delete cascade;
    `);

    this.addSql(`
      alter table "chat_messages"
      add constraint "chat_messages_sender_user_id_foreign"
      foreign key ("sender_user_id") references "users" ("id")
      on update cascade on delete restrict;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      drop table if exists "chat_messages" cascade;
    `);

    this.addSql(`
      drop table if exists "chat_conversations" cascade;
    `);
  }
}
