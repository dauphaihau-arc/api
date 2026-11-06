import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import {
  backfillUserAddressLocations,
  formatUserAddressLocationBackfillReport,
} from '~/domains/user/infra/backfill-user-address-locations';

/**
 * One-off backfill for saved-address location codes. Run after the expand
 * migration and before the web cutover:
 *
 *   pnpm db:backfill:user-address-locations
 *
 * Safe to rerun; rows that already hold final location data are left alone.
 */
async function main(): Promise<void> {
  const orm = await MikroORM.init({
    ...buildDatabaseConfig(process.env, {
      includeEntityGlobs: true,
      debug: false,
    }),
  });

  try {
    const report = await backfillUserAddressLocations(orm.em.fork());
    console.log(formatUserAddressLocationBackfillReport(report));
  }
  finally {
    await orm.close(true);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
