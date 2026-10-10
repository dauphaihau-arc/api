import { randomUUID } from 'node:crypto';
import { MikroORM } from '@mikro-orm/postgresql';
import { Client } from 'pg';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { MikroOrmCategoryCommandRepository } from '~/domains/category/infra/mikro-orm-category-command.repository';
import { MikroOrmCategoryQueryRepository } from '~/domains/category/infra/mikro-orm-category-query.repository';
import type { StorageService } from '~/integrations/storage/app/ports/storage.service';
import {
  createTestDatabase,
  dropTestDatabase,
  type TestDatabaseContext,
} from '../support/test-postgres';


jest.setTimeout(120_000);

describe('category public identity preparation (integration)', () => {
  let testDb: TestDatabaseContext;
  let sql: Client;
  let orm: MikroORM;

  beforeAll(async () => {
    testDb = await createTestDatabase('category_public_identity', { fresh: true });
    sql = new Client({
      host: testDb.rootConfig.host,
      port: testDb.rootConfig.port,
      user: testDb.rootConfig.user,
      password: testDb.rootConfig.password,
      database: testDb.dbName,
    });
    await sql.connect();
    Object.assign(process.env, {
      DB_HOST: testDb.rootConfig.host,
      DB_PORT: String(testDb.rootConfig.port),
      DB_USER: testDb.rootConfig.user,
      DB_PASSWORD: testDb.rootConfig.password,
      DB_NAME: testDb.dbName,
    });
    orm = await MikroORM.init(buildDatabaseConfig(process.env, { includeEntityGlobs: true, debug: false }));

    await orm.getMigrator().down();
    const rootA = '00000000-0000-4000-8000-000000000001';
    const rootB = '00000000-0000-4000-8000-000000000002';
    const child = '00000000-0000-4000-8000-000000000003';
    const emptySlug = '00000000-0000-4000-8000-000000000004';
    await sql.query(
      `insert into categories (id, created_at, updated_at, name, rank)
       values ($1, now(), now(), 'Gaming', 1), ($2, now(), now(), 'Gaming', 2), ($3, now(), now(), 'Gaming Laptops', 1), ($4, now(), now(), '!!!', 3)`,
      [rootA, rootB, child, emptySlug],
    );
    await sql.query('update categories set parent_id = $1 where id = $2', [rootA, child]);
    await orm.getMigrator().up();
  });

  afterAll(async () => {
    await sql?.end();
    await orm?.close(true);
    if (testDb) await dropTestDatabase(testDb);
  });

  it('backfills every retained category and captures identity-owned paths without choosing conflicts', async () => {
    const categories = await sql.query<{ id: string; public_id: string; slug: string }>(
      'select id, public_id::text, slug from categories order by public_id',
    );
    expect(categories.rows).toHaveLength(4);
    expect(new Set(categories.rows.map((row) => row.public_id)).size).toBe(4);
    expect(categories.rows.every((row) => BigInt(row.public_id) > 0n)).toBe(true);
    expect(categories.rows.map((row) => row.slug)).toContain('category');

    const childId = categories.rows.find((row) => row.slug === 'gaming-laptops')?.id;
    const childAlias = await sql.query<{ category_id: string }>(
      'select alias.category_id from category_legacy_path_aliases alias where alias.legacy_path = $1',
      ['/c/gaming/gaming-laptops'],
    );
    expect(childAlias.rows).toEqual([{ category_id: childId }]);

    const conflict = await sql.query<{
      ready: boolean;
      unresolved_conflict_count: string;
      category_id: string;
    }>(
      `select gate.ready, gate.unresolved_conflict_count, candidate.category_id
       from category_legacy_path_cutover_gate gate
       cross join category_legacy_path_candidates candidate
       where candidate.legacy_path = $1 order by candidate.category_id`,
      ['/c/gaming'],
    );
    expect(conflict.rows).toHaveLength(2);
    expect(conflict.rows.every((row) => row.ready === false && Number(row.unresolved_conflict_count) === 1)).toBe(true);
    const ambiguousAlias = await sql.query(
      'select legacy_path from category_legacy_path_aliases where legacy_path = $1',
      ['/c/gaming'],
    );
    expect(ambiguousAlias.rows).toHaveLength(0);
    const owners = await sql.query<{ category_id: string }>(
      'select category_id from category_legacy_path_candidates where legacy_path = $1 order by category_id',
      ['/c/gaming'],
    );
    await expect(sql.query('select resolve_category_legacy_path($1, $2)', ['/c/gaming', randomUUID()]))
      .rejects.toThrow(/recorded candidate/);
    await sql.query('select resolve_category_legacy_path($1, $2)', ['/c/gaming', owners.rows[0].category_id]);
    const resolvedGate = await sql.query<{ ready: boolean; unresolved_conflict_count: string }>(
      'select ready, unresolved_conflict_count from category_legacy_path_cutover_gate',
    );
    expect(resolvedGate.rows).toEqual([{ ready: true, unresolved_conflict_count: '0' }]);
    await expect(sql.query(
      'update category_legacy_path_aliases set category_id = $1 where legacy_path = $2',
      [owners.rows[1].category_id, '/c/gaming'],
    )).rejects.toThrow(/permanent/);
    await expect(sql.query(
      'delete from category_legacy_path_candidates where legacy_path = $1',
      ['/c/gaming'],
    )).rejects.toThrow(/permanent/);
    await expect(sql.query(
      'delete from category_legacy_path_aliases where legacy_path = $1',
      ['/c/gaming'],
    )).rejects.toThrow(/permanent/);
    const childParent = await sql.query<{ parent_id: string | null }>(
      'select parent_id from categories where id = $1',
      [childId],
    );
    const removableConflictCandidate = owners.rows.find(
      (owner) => owner.category_id !== childParent.rows[0].parent_id,
    );
    if (!removableConflictCandidate) {
      throw new Error('Expected one conflicting category that does not own the child ancestry');
    }
    await sql.query('delete from categories where id = $1', [removableConflictCandidate.category_id]);
    await expect(sql.query('delete from categories where id = $1', [childId]))
      .rejects.toThrow(/foreign key/i);
  });

  it('allocates unique concurrent bigint IDs, preserves them immutably, and never reuses gaps', async () => {
    await sql.query('select setval(\'category_public_id_seq\', 9007199254740993, false)');
    const repository = new MikroOrmCategoryCommandRepository(
      orm.em,
      { getPublicUrl: () => '' } as unknown as StorageService,
    );
    const created = await Promise.all(
      Array.from({ length: 12 }, (__, rank) =>
        repository.create({
          name: rank === 0 ? '東京 — Gaming!' : rank === 1 ? 'Kid\'s' : rank === 2 ? '!!!' : 'Gaming',
          rank,
        }),
      ),
    );
    const persisted = await sql.query<{ id: string; public_id: string; slug: string }>(
      'select id, public_id::text, slug from categories where id = any($1::uuid[])',
      [created.map((category) => category.id)],
    );
    const identities = persisted.rows.map((row) => BigInt(row.public_id));
    expect(persisted.rows).toHaveLength(12);
    expect(new Set(identities.map(String)).size).toBe(12);
    expect(identities.every((value) => value > BigInt(Number.MAX_SAFE_INTEGER))).toBe(true);
    expect(identities.map(String)).toContain('9007199254740993');
    expect(persisted.rows.find((row) => row.id === created[0].id)?.slug).toBe('東京-gaming');
    expect(persisted.rows.find((row) => row.id === created[1].id)?.slug).toBe('kids');
    expect(persisted.rows.find((row) => row.id === created[2].id)?.slug).toBe('category');
    expect(created.every((category) => /^[0-9a-f-]{36}$/i.test(category.id))).toBe(true);
    const browser = new MikroOrmCategoryQueryRepository(
      orm.em,
      { getPublicUrl: () => '' } as unknown as StorageService,
    );
    const listed = await browser.findAllByParentId();
    expect(listed.map((category) => category.id)).toEqual(expect.arrayContaining(created.map((category) => category.id)));

    const firstId = persisted.rows[0].id;
    await expect(sql.query('update categories set public_id = public_id + 100 where id = $1', [firstId]))
      .rejects.toThrow(/immutable/);
    const deletedId = persisted.rows[1].id;
    const deletedPublicId = BigInt(persisted.rows[1].public_id);
    await sql.query('delete from categories where id = $1', [deletedId]);
    const nextCategory = await repository.create({ name: 'Fresh', rank: 1 });
    const next = await sql.query<{ public_id: string }>(
      'select public_id::text from categories where id = $1',
      [nextCategory.id],
    );
    expect(BigInt(next.rows[0].public_id)).toBeGreaterThan(deletedPublicId);
  });
  it('aborts legacy path preparation rather than truncating cyclic ancestry', async () => {
    await orm.getMigrator().down();
    const child = await sql.query<{ id: string; parent_id: string | null }>(
      'select id, parent_id from categories where name = $1',
      ['Gaming Laptops'],
    );
    expect(child.rows).toHaveLength(1);
    const parentId = child.rows[0].parent_id;
    expect(parentId).toBeTruthy();
    await sql.query('update categories set parent_id = $1 where id = $2', [child.rows[0].id, parentId]);
    const cycle = await sql.query<{ id: string; parent_id: string | null }>(
      'select id, parent_id from categories where id = any($1::uuid[])',
      [[child.rows[0].id, parentId]],
    );
    expect(cycle.rows.every((row) => row.parent_id !== null)).toBe(true);
    await expect(orm.getMigrator().up()).rejects.toThrow(/ancestry contains a cycle/);
    await sql.query('update categories set parent_id = null where id = $1', [parentId]);
    await orm.getMigrator().up();
  });
});
