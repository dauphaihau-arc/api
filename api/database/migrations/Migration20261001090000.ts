import { Migration } from '@mikro-orm/migrations';

/**
 * The shop's own scheduling timezone.
 *
 * A shop authors Sale schedules in one IANA timezone so sellers who travel, or
 * staff in different places, do not change what "midnight" means for the shop.
 * It is only a default: every Sale stores the timezone it was created with, so
 * changing this column never reinterprets an existing Sale's start or end.
 *
 * Existing shops are backfilled with UTC rather than a guessed local zone, so
 * the value is explicit until a seller sets it in store settings.
 */
export class Migration20261001090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "shops" add column "timezone" varchar(64) not null default \'UTC\';');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "shops" drop column "timezone";');
  }
}
