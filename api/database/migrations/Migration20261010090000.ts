import { normalizeCategorySlug } from '../../src/domains/category/infra/category-slug';
import { Migration } from '@mikro-orm/migrations';

function legacySegment(name: string): string {
  return name.replaceAll(' ', '-').toLowerCase();
}

export class Migration20261010090000 extends Migration {
  override async up(): Promise<void> {
    await this.execute('lock table "categories" in share row exclusive mode');
    const categories = await this.execute('select "id", "parent_id", "name" from "categories"') as {
      id: string;
      parent_id: string | null;
      name: string;
    }[];
    const byId = new Map(categories.map((category) => [category.id, category]));
    const ordered = [...categories].sort((left, right) => left.id.localeCompare(right.id));

    this.addSql('create sequence "category_public_id_seq" as bigint start with 1 increment by 1 no cycle;');
    this.addSql('alter table "categories" add column "public_id" bigint;');
    this.addSql('alter table "categories" add column "slug" varchar(255);');
    this.addSql('create table "category_legacy_path_candidates" ("legacy_path" text not null, "category_id" uuid not null, primary key ("legacy_path", "category_id"));');
    this.addSql('create table "category_legacy_path_aliases" ("legacy_path" text primary key, "category_id" uuid not null references "categories"("id") on delete restrict, constraint "category_legacy_path_aliases_path_not_empty" check (length("legacy_path") > 0));');
    this.addSql('create table "category_legacy_path_conflicts" ("legacy_path" text primary key, "resolved_category_id" uuid null references "categories"("id") on delete restrict);');

    for (const category of ordered) {
      const slug = normalizeCategorySlug(category.name);
      this.addSql(this.getKnex().raw(
        'update "categories" set "public_id" = nextval(\'category_public_id_seq\'), "slug" = ? where "id" = ?',
        [slug, category.id],
      ));

      const segments: string[] = [];
      let current: typeof category | undefined = category;
      const seen = new Set<string>();
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        segments.unshift(legacySegment(current.name));
        current = current.parent_id ? byId.get(current.parent_id) : undefined;
      }
      if (current) {
        throw new Error(`Category ancestry contains a cycle at ${category.id}`);
      }
      this.addSql(this.getKnex().raw(
        'insert into "category_legacy_path_candidates" ("legacy_path", "category_id") values (?, ?) on conflict do nothing',
        [`/c/${segments.join('/')}`, category.id],
      ));
    }

    this.addSql('alter table "categories" alter column "public_id" set not null;');
    this.addSql('alter table "categories" alter column "slug" set not null;');
    this.addSql('alter table "categories" add constraint "categories_public_id_positive" check ("public_id" > 0);');
    this.addSql('alter table "categories" add constraint "categories_public_id_unique" unique ("public_id");');
    this.addSql('alter table "categories" alter column "public_id" set default nextval(\'category_public_id_seq\');');

    this.addSql('insert into "category_legacy_path_aliases" ("legacy_path", "category_id") select candidate."legacy_path", min(candidate."category_id"::text)::uuid from "category_legacy_path_candidates" candidate group by candidate."legacy_path" having count(*) = 1;');
    this.addSql('insert into "category_legacy_path_conflicts" ("legacy_path") select "legacy_path" from "category_legacy_path_candidates" group by "legacy_path" having count(*) > 1;');
    this.addSql(`
      create view "category_legacy_path_cutover_gate" as
      select count(*) filter (
        where conflict."resolved_category_id" is null
          or not exists (
            select 1 from "category_legacy_path_candidates" candidate
            where candidate."legacy_path" = conflict."legacy_path"
              and candidate."category_id" = conflict."resolved_category_id"
          )
          or not exists (
            select 1 from "category_legacy_path_aliases" alias
            where alias."legacy_path" = conflict."legacy_path"
              and alias."category_id" = conflict."resolved_category_id"
          )
      ) = 0 as "ready",
      count(*) filter (
        where conflict."resolved_category_id" is null
          or not exists (
            select 1 from "category_legacy_path_candidates" candidate
            where candidate."legacy_path" = conflict."legacy_path"
              and candidate."category_id" = conflict."resolved_category_id"
          )
          or not exists (
            select 1 from "category_legacy_path_aliases" alias
            where alias."legacy_path" = conflict."legacy_path"
              and alias."category_id" = conflict."resolved_category_id"
          )
      ) as "unresolved_conflict_count"
      from "category_legacy_path_conflicts" conflict;
    `);
    this.addSql(`
      create function "prevent_category_legacy_path_mutation"() returns trigger
      language plpgsql as $$
      begin
        raise exception 'category legacy path ownership is permanent';
      end
      $$;
    `);
    this.addSql(`
      create function "validate_category_legacy_alias_candidate"() returns trigger
      language plpgsql as $$
      begin
        if not exists (
          select 1 from "category_legacy_path_candidates" candidate
          where candidate."legacy_path" = new."legacy_path"
            and candidate."category_id" = new."category_id"
        ) then
          raise exception 'legacy path owner is not a recorded candidate';
        end if;
        return new;
      end
      $$;
    `);
    this.addSql(`
      create function "validate_category_legacy_conflict_resolution"() returns trigger
      language plpgsql as $$
      begin
        if new."legacy_path" is distinct from old."legacy_path" then
          raise exception 'legacy conflict paths are permanent';
        end if;
        if new."resolved_category_id" is not null and (
          not exists (
            select 1 from "category_legacy_path_candidates" candidate
            where candidate."legacy_path" = new."legacy_path"
              and candidate."category_id" = new."resolved_category_id"
          )
          or not exists (
            select 1 from "category_legacy_path_aliases" alias
            where alias."legacy_path" = new."legacy_path"
              and alias."category_id" = new."resolved_category_id"
          )
        ) then
          raise exception 'conflict resolution must match an alias candidate';
        end if;
        return new;
      end
      $$;
    `);
    this.addSql(`
      create function "resolve_category_legacy_path"(p_legacy_path text, p_category_id uuid)
      returns void language plpgsql as $$
      begin
        if not exists (
          select 1 from "category_legacy_path_conflicts"
          where "legacy_path" = p_legacy_path
        ) or not exists (
          select 1 from "category_legacy_path_candidates"
          where "legacy_path" = p_legacy_path and "category_id" = p_category_id
        ) then
          raise exception 'resolution must choose a recorded candidate for a conflict';
        end if;
        insert into "category_legacy_path_aliases" ("legacy_path", "category_id")
        values (p_legacy_path, p_category_id) on conflict ("legacy_path") do nothing;
        if not exists (
          select 1 from "category_legacy_path_aliases"
          where "legacy_path" = p_legacy_path and "category_id" = p_category_id
        ) then
          raise exception 'legacy path already has a different permanent owner';
        end if;
        update "category_legacy_path_conflicts"
        set "resolved_category_id" = p_category_id
        where "legacy_path" = p_legacy_path;
      end
      $$;
    `);
    this.addSql(`
      create function "prevent_category_public_id_change"() returns trigger
      language plpgsql as $$
      begin
        if new."public_id" is distinct from old."public_id" then
          raise exception 'category public_id is immutable';
        end if;
        return new;
      end
      $$;
    `);
    this.addSql('create trigger "categories_public_id_immutable" before update of "public_id" on "categories" for each row execute function "prevent_category_public_id_change"();');
    this.addSql('create trigger "category_legacy_candidates_immutable" before insert or update or delete on "category_legacy_path_candidates" for each row execute function "prevent_category_legacy_path_mutation"();');
    this.addSql('create trigger "category_legacy_aliases_immutable" before update or delete on "category_legacy_path_aliases" for each row execute function "prevent_category_legacy_path_mutation"();');
    this.addSql('create trigger "category_legacy_conflicts_no_delete" before delete on "category_legacy_path_conflicts" for each row execute function "prevent_category_legacy_path_mutation"();');
    this.addSql('create trigger "category_legacy_alias_candidate_required" before insert on "category_legacy_path_aliases" for each row execute function "validate_category_legacy_alias_candidate"();');
    this.addSql('create trigger "category_legacy_conflict_resolution_valid" before update on "category_legacy_path_conflicts" for each row execute function "validate_category_legacy_conflict_resolution"();');
  }

  override async down(): Promise<void> {
    this.addSql('drop trigger if exists "categories_public_id_immutable" on "categories";');
    this.addSql('drop view if exists "category_legacy_path_cutover_gate";');
    this.addSql('drop table if exists "category_legacy_path_conflicts";');
    this.addSql('drop table if exists "category_legacy_path_aliases";');
    this.addSql('drop table if exists "category_legacy_path_candidates";');
    this.addSql('drop function if exists "resolve_category_legacy_path"(text, uuid);');
    this.addSql('drop function if exists "validate_category_legacy_conflict_resolution"();');
    this.addSql('drop function if exists "validate_category_legacy_alias_candidate"();');
    this.addSql('drop function if exists "prevent_category_legacy_path_mutation"();');
    this.addSql('drop function if exists "prevent_category_public_id_change"();');
    this.addSql('alter table "categories" drop constraint if exists "categories_public_id_unique";');
    this.addSql('alter table "categories" drop constraint if exists "categories_public_id_positive";');
    this.addSql('alter table "categories" drop column if exists "slug";');
    this.addSql('alter table "categories" drop column if exists "public_id";');
    this.addSql('drop sequence if exists "category_public_id_seq";');
  }
}
