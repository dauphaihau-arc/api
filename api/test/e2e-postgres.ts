import { MikroORM } from '@mikro-orm/postgresql';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { buildDatabaseConfig } from '../src/config/database.config';

type TestDatabaseContext = {
  dbName: string;
  rootConfig: {
    host: string;
    port: number;
    user: string;
    password: string;
  };
};

export async function createTestDatabase(): Promise<TestDatabaseContext> {
  const dbName = `auth_e2e_${randomUUID().replace(/-/g, '_')}`;
  const rootConfig = {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
  };

  const adminClient = new Client({
    ...rootConfig,
    database: 'postgres',
  });

  await adminClient.connect();

  try {
    await adminClient.query(`CREATE DATABASE "${dbName}"`);
  }
  finally {
    await adminClient.end();
  }

  const orm = await MikroORM.init(
    buildDatabaseConfig(
      {
        ...process.env,
        DB_HOST: rootConfig.host,
        DB_PORT: String(rootConfig.port),
        DB_USER: rootConfig.user,
        DB_PASSWORD: rootConfig.password,
        DB_NAME: dbName,
      },
      { includeEntityGlobs: true }
    )
  );

  try {
    await orm.getMigrator().up();
  }
  finally {
    await orm.close(true);
  }

  return {
    dbName,
    rootConfig,
  };
}

export async function dropTestDatabase(
  context: TestDatabaseContext
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
      [context.dbName]
    );
    await adminClient.query(`DROP DATABASE IF EXISTS "${context.dbName}"`);
  }
  finally {
    await adminClient.end();
  }
}
