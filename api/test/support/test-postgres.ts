import { MikroORM } from '@mikro-orm/postgresql';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { buildDatabaseConfig } from '~/platform/config/database.config';

export type TestDatabaseContext = {
  dbName: string;
  rootConfig: {
    host: string;
    port: number;
    user: string;
    password: string;
  };
};

function normalizeDbPrefix(prefix: string): string {
  return prefix.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
}

export async function createTestDatabase(
  suiteName = 'api',
  options: { fresh?: boolean } = {},
): Promise<TestDatabaseContext> {
  // PostgreSQL truncates identifiers after 63 bytes; retain the entire UUID.
  const dbName = `arc_e2e_${normalizeDbPrefix(suiteName).slice(0, 22)}_${randomUUID().replace(/-/g, '')}`;
  const template = process.env.ARC_INT_TEMPLATE_DATABASE
    ? JSON.parse(process.env.ARC_INT_TEMPLATE_DATABASE) as TestDatabaseContext
    : undefined;
  const rootConfig = template?.rootConfig ?? {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
  };
  const context = { dbName, rootConfig };

  const adminClient = new Client({
    ...rootConfig,
    database: 'postgres',
  });

  await adminClient.connect();

  try {
    const source = template && !options.fresh
      ? ` TEMPLATE "${template.dbName.replace(/"/g, '""')}"`
      : '';
    await adminClient.query(`CREATE DATABASE "${dbName}"${source}`);
  }
  finally {
    await adminClient.end();
  }

  if (template && !options.fresh) return context;

  try {
    const orm = await MikroORM.init(
      buildDatabaseConfig(
        {
          ...process.env,
          // The helper owns a DB_* database, never the developer DATABASE_URL.
          DATABASE_URL: undefined,
          DB_HOST: rootConfig.host,
          DB_PORT: String(rootConfig.port),
          DB_USER: rootConfig.user,
          DB_PASSWORD: rootConfig.password,
          DB_NAME: dbName,
        },
        { includeEntityGlobs: true, debug: false },
      ),
    );

    try {
      await orm.getMigrator().up();
    }
    finally {
      await orm.close(true);
    }
  }
  catch (error) {
    await dropTestDatabase(context);
    throw error;
  }

  return context;
}

export async function dropTestDatabase(
  context: TestDatabaseContext,
): Promise<void> {
  const adminClient = new Client({
    ...context.rootConfig,
    database: 'postgres',
  });

  await adminClient.connect();

  try {
    await adminClient.query(
      `
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `,
      [context.dbName],
    );
    await adminClient.query(`DROP DATABASE IF EXISTS "${context.dbName}"`);
  }
  finally {
    await adminClient.end();
  }
}
