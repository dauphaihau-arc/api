import 'reflect-metadata';
import { Client } from 'pg';
import { buildDatabaseConfig } from '../src/config/database.config';

async function main() {
  const config = buildDatabaseConfig(process.env);
  const client =
    typeof config.clientUrl === 'string'
      ? new Client({
        connectionString: config.clientUrl,
        ssl: config.driverOptions?.connection?.ssl,
      })
      : new Client({
        host: process.env.DB_HOST ?? '127.0.0.1',
        port: Number(process.env.DB_PORT ?? 5432),
        user: process.env.DB_USER ?? 'postgres',
        password: process.env.DB_PASSWORD ?? 'postgres',
        database: process.env.DB_NAME ?? 'app',
        ssl: config.driverOptions?.connection?.ssl,
      });

  await client.connect();

  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE;');
    await client.query('CREATE SCHEMA public;');
    console.log('Database schema cleared');
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
