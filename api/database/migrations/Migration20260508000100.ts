import { Migration } from '@mikro-orm/migrations';

export class Migration20260508000100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'create table "users" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "email" varchar(255) not null, "display_name" varchar(255) null, "status" varchar(255) not null, "email_verified_at" timestamptz null, constraint "users_pkey" primary key ("id"));',
    );
    this.addSql('alter table "users" add constraint "users_email_unique" unique ("email");');

    this.addSql(
      'create table "roles" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "key" varchar(255) not null, "name" varchar(255) not null, "description" varchar(255) null, constraint "roles_pkey" primary key ("id"));',
    );
    this.addSql('alter table "roles" add constraint "roles_key_unique" unique ("key");');

    this.addSql(
      'create table "permissions" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "key" varchar(255) not null, "name" varchar(255) not null, "description" varchar(255) null, constraint "permissions_pkey" primary key ("id"));',
    );
    this.addSql(
      'alter table "permissions" add constraint "permissions_key_unique" unique ("key");',
    );

    this.addSql(
      'create table "user_credentials" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "password_hash" varchar(255) not null, "password_updated_at" timestamptz not null, "user_id" uuid not null, constraint "user_credentials_pkey" primary key ("id"));',
    );
    this.addSql(
      'alter table "user_credentials" add constraint "user_credentials_user_id_unique" unique ("user_id");',
    );

    this.addSql(
      'create table "user_sessions" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "refresh_token_hash" varchar(255) not null, "expires_at" timestamptz not null, "revoked_at" timestamptz null, "user_agent" varchar(255) null, "ip_address" varchar(255) null, "user_id" uuid not null, constraint "user_sessions_pkey" primary key ("id"));',
    );
    this.addSql(
      'create index "user_sessions_user_id_index" on "user_sessions" ("user_id");',
    );
    this.addSql(
      'create index "user_sessions_expires_at_index" on "user_sessions" ("expires_at");',
    );
    this.addSql(
      'create index "user_sessions_revoked_at_index" on "user_sessions" ("revoked_at");',
    );

    this.addSql(
      'create table "password_reset_tokens" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "token_hash" varchar(255) not null, "expires_at" timestamptz not null, "used_at" timestamptz null, "user_id" uuid not null, constraint "password_reset_tokens_pkey" primary key ("id"));',
    );
    this.addSql(
      'create index "password_reset_tokens_user_id_index" on "password_reset_tokens" ("user_id");',
    );

    this.addSql(
      'create table "email_verification_tokens" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "token_hash" varchar(255) not null, "expires_at" timestamptz not null, "used_at" timestamptz null, "user_id" uuid not null, constraint "email_verification_tokens_pkey" primary key ("id"));',
    );
    this.addSql(
      'create index "email_verification_tokens_user_id_index" on "email_verification_tokens" ("user_id");',
    );

    this.addSql(
      'create table "user_roles" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "assigned_at" timestamptz not null, "user_id" uuid not null, "role_id" uuid not null, constraint "user_roles_pkey" primary key ("id"));',
    );
    this.addSql(
      'alter table "user_roles" add constraint "user_roles_user_id_role_id_unique" unique ("user_id", "role_id");',
    );

    this.addSql(
      'create table "role_permissions" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "granted_at" timestamptz not null, "role_id" uuid not null, "permission_id" uuid not null, constraint "role_permissions_pkey" primary key ("id"));',
    );
    this.addSql(
      'alter table "role_permissions" add constraint "role_permissions_role_id_permission_id_unique" unique ("role_id", "permission_id");',
    );

    this.addSql(
      'alter table "user_credentials" add constraint "user_credentials_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;',
    );
    this.addSql(
      'alter table "user_sessions" add constraint "user_sessions_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;',
    );
    this.addSql(
      'alter table "password_reset_tokens" add constraint "password_reset_tokens_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;',
    );
    this.addSql(
      'alter table "email_verification_tokens" add constraint "email_verification_tokens_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;',
    );
    this.addSql(
      'alter table "user_roles" add constraint "user_roles_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;',
    );
    this.addSql(
      'alter table "user_roles" add constraint "user_roles_role_id_foreign" foreign key ("role_id") references "roles" ("id") on update cascade on delete cascade;',
    );
    this.addSql(
      'alter table "role_permissions" add constraint "role_permissions_role_id_foreign" foreign key ("role_id") references "roles" ("id") on update cascade on delete cascade;',
    );
    this.addSql(
      'alter table "role_permissions" add constraint "role_permissions_permission_id_foreign" foreign key ("permission_id") references "permissions" ("id") on update cascade on delete cascade;',
    );
  }

  override async down(): Promise<void> {
    this.addSql('alter table "user_credentials" drop constraint "user_credentials_user_id_foreign";');
    this.addSql('alter table "user_sessions" drop constraint "user_sessions_user_id_foreign";');
    this.addSql('alter table "password_reset_tokens" drop constraint "password_reset_tokens_user_id_foreign";');
    this.addSql('alter table "email_verification_tokens" drop constraint "email_verification_tokens_user_id_foreign";');
    this.addSql('alter table "user_roles" drop constraint "user_roles_user_id_foreign";');
    this.addSql('alter table "user_roles" drop constraint "user_roles_role_id_foreign";');
    this.addSql('alter table "role_permissions" drop constraint "role_permissions_role_id_foreign";');
    this.addSql('alter table "role_permissions" drop constraint "role_permissions_permission_id_foreign";');

    this.addSql('drop table if exists "user_credentials" cascade;');
    this.addSql('drop table if exists "user_sessions" cascade;');
    this.addSql('drop table if exists "password_reset_tokens" cascade;');
    this.addSql('drop table if exists "email_verification_tokens" cascade;');
    this.addSql('drop table if exists "user_roles" cascade;');
    this.addSql('drop table if exists "role_permissions" cascade;');
    this.addSql('drop table if exists "permissions" cascade;');
    this.addSql('drop table if exists "roles" cascade;');
    this.addSql('drop table if exists "users" cascade;');
  }
}
