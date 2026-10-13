import { MikroORM } from '@mikro-orm/postgresql';
import { Client } from 'pg';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { MikroOrmCategoryQueryRepository } from '~/domains/category/infra/mikro-orm-category-query.repository';
import type { StorageService } from '~/integrations/storage/app/ports/storage.service';
import {
  createTestDatabase,
  dropTestDatabase,
  type TestDatabaseContext,
} from '../support/test-postgres';

jest.setTimeout(120_000);

/**
 * Permanently owned legacy paths, verified against real PostgreSQL persistence.
 *
 * The migration captures one alias per single-owner hierarchical path and binds
 * it to the category's UUID identity. Resolution reads the category's *current*
 * slug, so a legacy path always converges on the latest canonical URL, and a
 * path with no single owner is never guessed from a parent or a first match.
 */
describe('category legacy path resolution (integration)', () => {
  let testDb: TestDatabaseContext;
  let sql: Client;
  let orm: MikroORM;
  let repository: MikroOrmCategoryQueryRepository;

  const HOME = '00000000-0000-4000-9000-000000000001';
  const CHILD = '00000000-0000-4000-9000-000000000002';
  const DUPLICATE_A = '00000000-0000-4000-9000-000000000003';
  const DUPLICATE_B = '00000000-0000-4000-9000-000000000004';

  beforeAll(async () => {
    testDb = await createTestDatabase('category_legacy_path', { fresh: true });
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
    await sql.query(
      `insert into categories (id, created_at, updated_at, name, rank)
       values
         ($1, now(), now(), 'Home', 1),
         ($2, now(), now(), 'Caf\u00e9 Cadeaux', 1),
         ($3, now(), now(), 'Gaming Mice', 2),
         ($4, now(), now(), 'Gaming_Mice', 3)`,
      [HOME, CHILD, DUPLICATE_A, DUPLICATE_B],
    );
    await sql.query('update categories set parent_id = $1 where id = $2', [HOME, CHILD]);
    await orm.getMigrator().up();

    repository = new MikroOrmCategoryQueryRepository(
      orm.em,
      { getPublicUrl: () => '' } as unknown as StorageService,
    );
  });

  afterAll(async () => {
    await sql?.end();
    await orm?.close(true);
    if (testDb) await dropTestDatabase(testDb);
  });

  async function publicIdOf(id: string): Promise<string> {
    const rows = await sql.query<{ public_id: string }>(
      'select public_id::text from categories where id = $1',
      [id],
    );
    return rows.rows[0].public_id;
  }

  it('resolves an owned hierarchical path to the current category and ordered ancestry', async () => {
    const childPublicId = await publicIdOf(CHILD);

    const resolution = await repository.resolveLegacyPath('/c/home/caf\u00e9-cadeaux');

    expect(resolution).not.toBeNull();
    expect(resolution?.category).toEqual({
      id: childPublicId,
      slug: 'caf\u00e9-cadeaux',
      name: 'Caf\u00e9 Cadeaux',
      featuredFacetKeys: undefined,
    });
    expect(resolution?.ancestry.map((entry) => entry.name)).toEqual(['Home', 'Caf\u00e9 Cadeaux']);
  });

  it('keeps duplicate slugs distinct by always resolving the owned identity', async () => {
    const [duplicateA, duplicateB] = await Promise.all([
      publicIdOf(DUPLICATE_A),
      publicIdOf(DUPLICATE_B),
    ]);

    const first = await repository.resolveLegacyPath('/c/gaming-mice');
    const second = await repository.resolveLegacyPath('/c/gaming_mice');

    expect(first?.category).toMatchObject({ id: duplicateA, slug: 'gaming-mice' });
    expect(second?.category).toMatchObject({ id: duplicateB, slug: 'gaming-mice' });
    expect(first?.category.id).not.toBe(second?.category.id);
  });

  it('returns null for malformed, unowned, and parent-only paths without a first-match guess', async () => {
    await expect(repository.resolveLegacyPath('/c/home/')).resolves.toBeNull();
    await expect(repository.resolveLegacyPath('/c/home/unknown')).resolves.toBeNull();
    await expect(repository.resolveLegacyPath('/c/home/gaming-mice')).resolves.toBeNull();
    await expect(repository.resolveLegacyPath('home')).resolves.toBeNull();
    await expect(repository.resolveLegacyPath('/c/')).resolves.toBeNull();
  });

  // Mutates the fixture slug, so it runs last.
  it('serves the current slug so a later slug change never resurrects the old URL', async () => {
    const duplicateA = await publicIdOf(DUPLICATE_A);
    await sql.query('update categories set slug = $1 where id = $2', ['gaming-mice-eu', DUPLICATE_A]);

    const resolution = await repository.resolveLegacyPath('/c/gaming-mice');

    expect(resolution?.category).toEqual(
      expect.objectContaining({ id: duplicateA, slug: 'gaming-mice-eu' }),
    );
  });
});
