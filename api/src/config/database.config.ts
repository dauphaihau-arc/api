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

export function buildDatabaseConfig(
  env: DatabaseEnv,
  options?: { includeEntityGlobs?: boolean }
): Options<PostgreSqlDriver> {
  const includeEntityGlobs = options?.includeEntityGlobs ?? false;
  const connectionUrl = env.DATABASE_URL?.trim();

  if (connectionUrl) {
    const parsedUrl = new URL(connectionUrl);

    return {
      driver: PostgreSqlDriver,
      host: parsedUrl.hostname,
      port: Number(parsedUrl.port || 5432),
      user: decodeURIComponent(parsedUrl.username),
      password: decodeURIComponent(parsedUrl.password),
      dbName: parsedUrl.pathname.replace(/^\//, '') || 'app',
      debug: env.NODE_ENV !== 'production',
      ...(includeEntityGlobs
        ? {
          entities: ['dist/**/*.entity.js'],
          entitiesTs: ['src/**/*.entity.ts'],
        }
        : {}),
      migrations: {
        path: 'dist/database/migrations',
        pathTs: 'database/migrations',
        tableName: 'mikro_orm_migrations',
      },
    };
  }

  return {
    driver: PostgreSqlDriver,
    host: env.DB_HOST ?? '127.0.0.1',
    port: Number(env.DB_PORT ?? 5432),
    user: env.DB_USER ?? 'postgres',
    password: env.DB_PASSWORD ?? 'postgres',
    dbName: env.DB_NAME ?? 'app',
    debug: env.NODE_ENV !== 'production',
    ...(includeEntityGlobs
      ? {
        entities: ['dist/**/*.entity.js'],
        entitiesTs: ['src/**/*.entity.ts'],
      }
      : {}),
    migrations: {
      path: 'dist/database/migrations',
      pathTs: 'database/migrations',
      tableName: 'mikro_orm_migrations',
    },
  };
}
