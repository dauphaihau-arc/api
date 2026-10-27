import { Migration } from '@mikro-orm/migrations';

const ADMIN_RESTRICTED_PERMISSION_KEYS = [
  'users.read',
  'users.manage',
  'roles.read',
  'roles.manage',
  'audit.read',
];

const ADMIN_RESTRICTED_PERMISSION_SQL = ADMIN_RESTRICTED_PERMISSION_KEYS
  .map((key) => `'${key}'`)
  .join(', ');

/**
 * `super_admin` owns platform administration (users, roles and the audit
 * trail) while `admin` keeps marketplace operations. Existing admins keep only
 * `admin`; super admins are granted deliberately. The five administration
 * permissions are withdrawn from `admin`.
 */
export class Migration20261026120000_add_super_admin_role extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      insert into "roles" (
        "id", "created_at", "updated_at", "key", "name", "description"
      )
      select
        gen_random_uuid(),
        now(),
        now(),
        'super_admin',
        'Super Admin',
        'Full platform administration, including users, roles and audit logs'
      where not exists (
        select 1 from "roles" where "key" = 'super_admin'
      );
    `);

    // The role holds every permission, including any granted after this runs.
    this.addSql(`
      insert into "role_permissions" (
        "id", "created_at", "updated_at", "granted_at", "role_id", "permission_id"
      )
      select
        gen_random_uuid(),
        now(),
        now(),
        now(),
        super_admin."id",
        permission."id"
      from "roles" super_admin
      cross join "permissions" permission
      where super_admin."key" = 'super_admin'
        and not exists (
          select 1
          from "role_permissions" existing
          where existing."role_id" = super_admin."id"
            and existing."permission_id" = permission."id"
        );
    `);

    this.addSql(`
      delete from "role_permissions"
      using "roles" admin_role, "permissions" permission
      where "role_permissions"."role_id" = admin_role."id"
        and admin_role."key" = 'admin'
        and "role_permissions"."permission_id" = permission."id"
        and permission."key" in (${ADMIN_RESTRICTED_PERMISSION_SQL});
    `);
  }

  override async down(): Promise<void> {
    // Restoring administration to admin keeps existing admins able to reach
    // those screens if the role split is rolled back.
    this.addSql(`
      insert into "role_permissions" (
        "id", "created_at", "updated_at", "granted_at", "role_id", "permission_id"
      )
      select
        gen_random_uuid(),
        now(),
        now(),
        now(),
        admin_role."id",
        permission."id"
      from "roles" admin_role
      cross join "permissions" permission
      where admin_role."key" = 'admin'
        and permission."key" in (${ADMIN_RESTRICTED_PERMISSION_SQL})
        and not exists (
          select 1
          from "role_permissions" existing
          where existing."role_id" = admin_role."id"
            and existing."permission_id" = permission."id"
        );
    `);

    // The role can only be retired when no user still holds it; removing the
    // assignment would revoke access from a user who was given super_admin.
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1
          from "user_roles" user_role
          inner join "roles" super_admin on super_admin."id" = user_role."role_id"
          where super_admin."key" = 'super_admin'
        ) then
          delete from "role_permissions" role_permission
          using "roles" super_admin
          where role_permission."role_id" = super_admin."id"
            and super_admin."key" = 'super_admin';

          delete from "roles" where "key" = 'super_admin';
        else
          raise notice 'roles keeps super_admin: users still hold the role';
        end if;
      end
      $$;
    `);
  }
}
