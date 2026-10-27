import { Migration } from '@mikro-orm/migrations';

const FINANCE_PERMISSION_KEYS = [
  'auth.me.read',
  'auth.session.manage',
  'orders.manage',
  'finance.manage',
];

const FINANCE_PERMISSION_SQL = FINANCE_PERMISSION_KEYS
  .map((key) => `'${key}'`)
  .join(', ');

/**
 * `finance` is a back-office role: it reaches the admin portal to review order
 * and shop financials without user, role, audit or shop management. The role
 * links only permissions that already exist and no user is promoted.
 */
export class Migration20261027120000_add_finance_role extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      insert into "roles" (
        "id", "created_at", "updated_at", "key", "name", "description"
      )
      select
        gen_random_uuid(),
        now(),
        now(),
        'finance',
        'Finance',
        'Reviews order and shop financials'
      where not exists (
        select 1 from "roles" where "key" = 'finance'
      );
    `);

    this.addSql(`
      insert into "role_permissions" (
        "id", "created_at", "updated_at", "granted_at", "role_id", "permission_id"
      )
      select
        gen_random_uuid(),
        now(),
        now(),
        now(),
        finance_role."id",
        permission."id"
      from "roles" finance_role
      cross join "permissions" permission
      where finance_role."key" = 'finance'
        and permission."key" in (${FINANCE_PERMISSION_SQL})
        and not exists (
          select 1
          from "role_permissions" existing
          where existing."role_id" = finance_role."id"
            and existing."permission_id" = permission."id"
        );
    `);
  }

  override async down(): Promise<void> {
    // The role can only be retired when no user still holds it; removing the
    // assignment would revoke access from a user who was given finance.
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1
          from "user_roles" user_role
          inner join "roles" finance_role on finance_role."id" = user_role."role_id"
          where finance_role."key" = 'finance'
        ) then
          delete from "role_permissions" role_permission
          using "roles" finance_role
          where role_permission."role_id" = finance_role."id"
            and finance_role."key" = 'finance';

          delete from "roles" where "key" = 'finance';
        else
          raise notice 'roles keeps finance: users still hold the role';
        end if;
      end
      $$;
    `);
  }
}
