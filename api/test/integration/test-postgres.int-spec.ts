import { randomUUID } from 'node:crypto';
import { MikroORM } from '@mikro-orm/postgresql';
import { Client } from 'pg';
import {
  createTestDatabase,
  dropTestDatabase,
  type TestDatabaseContext,
} from '../support/test-postgres';

jest.setTimeout(60_000);

describe('integration database templates', () => {
  const databases: TestDatabaseContext[] = [];
  const clients: Client[] = [];
  let originalTemplate: string | undefined;
  let source: TestDatabaseContext;

  async function connect(database: TestDatabaseContext): Promise<Client> {
    const client = new Client({ ...database.rootConfig, database: database.dbName });
    clients.push(client);
    await client.connect();
    return client;
  }

  beforeAll(async () => {
    originalTemplate = process.env.ARC_INT_TEMPLATE_DATABASE;
    source = await createTestDatabase('template_contract');
    databases.push(source);
    const client = await connect(source);
    await client.query('create table clone_marker (id integer primary key, value text not null)');
    await client.query('insert into clone_marker values (1, $1)', ['original']);
    await client.end();
    clients.pop();
    process.env.ARC_INT_TEMPLATE_DATABASE = JSON.stringify(source);
  });

  afterAll(async () => {
    if (originalTemplate === undefined) {
      delete process.env.ARC_INT_TEMPLATE_DATABASE;
    }
    else {
      process.env.ARC_INT_TEMPLATE_DATABASE = originalTemplate;
    }
    await Promise.all(clients.map((client) => client.end()));
    await Promise.all(databases.map((database) => dropTestDatabase(database)));
  });

  it('copies schema and data into independent databases for concurrent suites', async () => {
    const results = await Promise.allSettled([
      createTestDatabase('concurrent_clone'),
      createTestDatabase('concurrent_clone'),
    ]);
    const copies: TestDatabaseContext[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        databases.push(result.value);
        copies.push(result.value);
      }
    }
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
    }
    const [first, second] = await Promise.all(copies.map(connect));
    expect(copies[0].dbName).not.toBe(copies[1].dbName);
    await first.query('update clone_marker set value = $1 where id = 1', ['changed']);
    expect((await first.query('select * from clone_marker')).rows).toEqual([
      { id: 1, value: 'changed' },
    ]);
    expect((await second.query('select * from clone_marker')).rows).toEqual([
      { id: 1, value: 'original' },
    ]);
    const sourceClient = await connect(source);
    expect((await sourceClient.query('select * from clone_marker')).rows).toEqual([
      { id: 1, value: 'original' },
    ]);
  });

  it('runs migrations from scratch when a migration suite requests a fresh database', async () => {
    const database = await createTestDatabase('fresh_migration_contract', { fresh: true });
    databases.push(database);
    const client = await connect(database);
    const result = await client.query(
      'select to_regclass($1) as marker, to_regclass($2) as users',
      ['public.clone_marker', 'public.users'],
    );
    expect(result.rows).toEqual([{ marker: null, users: 'users' }]);
  });

  it('drops the database when ORM initialization fails after creation', async () => {
    const suiteName = `failed_${randomUUID().slice(0, 8)}`;
    const prefix = `arc_e2e_${suiteName}_`;
    const admin = await connect({ ...source, dbName: 'postgres' });
    const init = jest.spyOn(MikroORM, 'init')
      .mockRejectedValueOnce(new Error('ORM initialization failed'));
    try {
      await expect(createTestDatabase(suiteName, { fresh: true }))
        .rejects.toThrow('ORM initialization failed');
      const remaining = await admin.query(
        'select datname from pg_database where left(datname, length($1)) = $1',
        [prefix],
      );
      expect(remaining.rows).toEqual([]);
    }
    finally {
      init.mockRestore();
    }
  });
});
