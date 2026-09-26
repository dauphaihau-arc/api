import type { Options } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';

type DatabaseEnv = Partial<
  Record<
    | 'DATABASE_URL'
    | 'DB_HOST'
    | 'DB_PORT'
    | 'DB_USER'
    | 'DB_PASSWORD'
    | 'DB_NAME'
    | 'NODE_ENV',
    string
  >
>;

/**
 * Prefixes used by the integration harness for throwaway databases
 * (`test/support/test-postgres.ts` and the specs that create databases inline).
 */
const EPHEMERAL_DATABASE_PREFIXES = ['arc_e2e_', 'auth_e2e_'];

export function buildDatabaseConfig(
  env: DatabaseEnv,
  options?: { includeEntityGlobs?: boolean; debug?: boolean },
): Options<PostgreSqlDriver> {
  const includeEntityGlobs = options?.includeEntityGlobs ?? false;
  const debug = options?.debug ?? env.NODE_ENV !== 'production';
  const connectionUrl = env.DATABASE_URL?.trim();
  const dbName = connectionUrl
    ? new URL(connectionUrl).pathname.replace(/^\//, '') || 'app'
    : env.DB_NAME ?? 'app';

  /**
   * MikroORM writes `.snapshot-${dbName}.json` into the migrations directory after
   * every `up()` that applied a migration, and reads it back as the diff baseline
   * for `migration:create`. Ephemeral test databases are created, migrated, and
   * dropped per suite run, so their snapshots are never read again; leaving the
   * snapshot enabled accumulates one ~400 KB file per run.
   */
  const migrations: Options<PostgreSqlDriver>['migrations'] = {
    path: 'dist/database/migrations',
    pathTs: 'database/migrations',
    tableName: 'mikro_orm_migrations',
    ...(EPHEMERAL_DATABASE_PREFIXES.some((prefix) => dbName.startsWith(prefix))
      ? { snapshot: false }
      : {}),
  };

  if (connectionUrl) {
    const parsedUrl = new URL(connectionUrl);
    const sslMode = parsedUrl.searchParams.get('sslmode');

    return {
      driver: PostgreSqlDriver,
      clientUrl: connectionUrl,
      ...(sslMode === 'require'
        ? {
          driverOptions: {
            connection: {
              ssl: {
                rejectUnauthorized: false,
              },
            },
          },
        }
        : {}),
      debug,
      ...(includeEntityGlobs
        ? {
          entities: ['dist/**/*.entity.js'],
          entitiesTs: ['src/**/*.entity.ts'],
        }
        : {}),
      migrations,
    };
  }

  return {
    driver: PostgreSqlDriver,
    host: env.DB_HOST ?? '127.0.0.1',
    port: Number(env.DB_PORT ?? 5432),
    user: env.DB_USER ?? 'postgres',
    password: env.DB_PASSWORD ?? 'postgres',
    dbName,
    debug,
    ...(includeEntityGlobs
      ? {
        entities: ['dist/**/*.entity.js'],
        entitiesTs: ['src/**/*.entity.ts'],
      }
      : {}),
    migrations,
  };
}
