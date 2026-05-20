import { Migration } from '@mikro-orm/migrations';

export class Migration20260520193000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "audit_logs" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "action" varchar(255) not null,
        "entity_type" varchar(255) not null,
        "entity_id" varchar(255) not null,
        "entity_public_id" varchar(255) null,
        "actor_id" varchar(255) null,
        "actor_email" varchar(255) null,
        "session_id" varchar(255) null,
        "request_id" varchar(255) null,
        "ip_address" varchar(255) null,
        "user_agent" varchar(255) null,
        "summary" jsonb null,
        constraint "audit_logs_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create index "audit_logs_action_index" on "audit_logs" ("action");
    `);
    this.addSql(`
      create index "audit_logs_entity_type_entity_id_index" on "audit_logs" ("entity_type", "entity_id");
    `);
    this.addSql(`
      create index "audit_logs_actor_id_index" on "audit_logs" ("actor_id");
    `);
    this.addSql(`
      create index "audit_logs_request_id_index" on "audit_logs" ("request_id");
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "audit_logs" cascade;');
  }
}
