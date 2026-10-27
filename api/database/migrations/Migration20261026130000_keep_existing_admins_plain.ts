import { Migration } from '@mikro-orm/migrations';

/**
 * The first super-admin migration promoted every `admin` holder to
 * `super_admin` so no operator lost access during the upgrade. That was too
 * broad: old admins should stay plain admins. This removes `super_admin` from
 * any account that also holds `admin`, leaving accounts that hold
 * `super_admin` on its own untouched.
 *
 * The reversal is not automatic: after this runs there is no record of which
 * dual-role accounts were promoted by the migration and which were granted
 * deliberately, so `down()` is a no-op.
 */
export class Migration20261026130000_keep_existing_admins_plain extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      delete from "user_roles" promoted
      using "roles" super_admin_role, "roles" admin_role, "user_roles" admin_link
      where promoted."role_id" = super_admin_role."id"
        and super_admin_role."key" = 'super_admin'
        and admin_link."user_id" = promoted."user_id"
        and admin_link."role_id" = admin_role."id"
        and admin_role."key" = 'admin';
    `);
  }

  override async down(): Promise<void> {
    // Deliberately empty: the correct previous state cannot be reconstructed.
  }
}
