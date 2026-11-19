import { randomUUID } from 'node:crypto';
import { MikroORM } from '@mikro-orm/postgresql';
import type { EntityManager } from '@mikro-orm/postgresql';
import { Client } from 'pg';
import { CategoryEntity } from '~/domains/category/infra/persistence/entities/category.entity';
import { CategoryTranslationEntity } from '~/domains/category/infra/persistence/entities/category-translation.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ProductTranslationEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-translation.entity';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import {
  createTestDatabase,
  dropTestDatabase,
  type TestDatabaseContext,
} from '../support/test-postgres';

jest.setTimeout(240_000);

describe('Localized Content schema', () => {
  let testDb: TestDatabaseContext;
  let orm: MikroORM;
  let em: EntityManager;
  let sql: Client;
  let category: CategoryEntity;
  let product: ProductEntity;

  beforeAll(async () => {
    testDb = await createTestDatabase('localized_content_int', { fresh: true });
    process.env.DB_HOST = testDb.rootConfig.host;
    process.env.DB_PORT = String(testDb.rootConfig.port);
    process.env.DB_USER = testDb.rootConfig.user;
    process.env.DB_PASSWORD = testDb.rootConfig.password;
    process.env.DB_NAME = testDb.dbName;
    delete process.env.DATABASE_URL;

    orm = await MikroORM.init(
      buildDatabaseConfig(process.env, { includeEntityGlobs: true, debug: false }),
    );
    em = orm.em.fork();

    sql = new Client({
      ...testDb.rootConfig,
      database: testDb.dbName,
    });
    await sql.connect();
  });

  afterAll(async () => {
    await sql?.end();
    await orm?.close(true);
    if (testDb) {
      await dropTestDatabase(testDb);
    }
  });

  beforeEach(async () => {
    em.clear();
    const suffix = randomUUID();
    const user = em.create(UserEntity, {
      email: `localized-${suffix}@example.com`,
    });
    const shop = em.create(ShopEntity, {
      ownerUser: user,
      shopName: `Localized Shop ${suffix}`,
      slug: `localized-shop-${suffix}`,
      currency: 'USD',
    });
    category = em.create(CategoryEntity, {
      name: 'Dresses',
      slug: `dresses-${suffix}`,
      rank: 1,
    });
    product = em.create(ProductEntity, {
      shop,
      category,
      title: 'Linen Weekend Dress',
      slug: `linen-weekend-dress-${suffix}`,
      description: 'Relaxed linen dress with a lightweight drape.',
      whoMade: ProductWhoMade.I_DID,
    });

    await em.persistAndFlush([user, shop, category, product]);
  });

  it('creates the translation tables, unique keys, language checks, and cascading foreign keys', async () => {
    const columns = await sql.query<{
      table_name: string;
      column_name: string;
      is_nullable: string;
    }>(`
      select table_name, column_name, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('product_translations', 'category_translations')
      order by table_name, ordinal_position
    `);

    expect(columns.rows).toEqual(expect.arrayContaining([
      { table_name: 'product_translations', column_name: 'product_id', is_nullable: 'NO' },
      { table_name: 'product_translations', column_name: 'language', is_nullable: 'NO' },
      { table_name: 'product_translations', column_name: 'title', is_nullable: 'YES' },
      { table_name: 'product_translations', column_name: 'description', is_nullable: 'YES' },
      { table_name: 'category_translations', column_name: 'category_id', is_nullable: 'NO' },
      { table_name: 'category_translations', column_name: 'language', is_nullable: 'NO' },
      { table_name: 'category_translations', column_name: 'name', is_nullable: 'YES' },
    ]));

    const constraints = await sql.query<{
      conname: string;
      contype: string;
      confdeltype: string | null;
    }>(`
      select conname, contype, confdeltype
      from pg_constraint
      where conrelid in (
        'product_translations'::regclass,
        'category_translations'::regclass
      )
    `);

    expect(constraints.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conname: 'product_translations_product_id_language_unique',
        contype: 'u',
      }),
      expect.objectContaining({
        conname: 'product_translations_product_id_foreign',
        contype: 'f',
        confdeltype: 'c',
      }),
      expect.objectContaining({
        conname: 'product_translations_language_check',
        contype: 'c',
      }),
      expect.objectContaining({
        conname: 'category_translations_category_id_language_unique',
        contype: 'u',
      }),
      expect.objectContaining({
        conname: 'category_translations_category_id_foreign',
        contype: 'f',
        confdeltype: 'c',
      }),
      expect.objectContaining({
        conname: 'category_translations_language_check',
        contype: 'c',
      }),
    ]));

    const shopTranslations = await sql.query<{ table_name: string | null }>(
      'select to_regclass($1)::text as table_name',
      ['public.shop_translations'],
    );
    expect(shopTranslations.rows[0]?.table_name).toBeNull();
  });

  it('stores translations without mutating the English base content', async () => {
    const productTranslation = em.create(ProductTranslationEntity, {
      product,
      language: 'vi',
      title: 'Váy cuối tuần bằng lanh',
      description: 'Mô tả tiếng Việt',
    });
    const categoryTranslation = em.create(CategoryTranslationEntity, {
      category,
      language: 'vi',
      name: 'Váy',
    });
    await em.persistAndFlush([productTranslation, categoryTranslation]);

    productTranslation.title = 'Váy lanh cuối tuần';
    await em.flush();
    const productTranslationId = productTranslation.id;
    em.clear();

    const reloadedProduct = await em.findOneOrFail(ProductEntity, product.id);
    const reloadedCategory = await em.findOneOrFail(CategoryEntity, category.id);
    const reloadedTranslation = await em.findOneOrFail(
      ProductTranslationEntity,
      productTranslationId,
    );

    expect(reloadedProduct.title).toBe('Linen Weekend Dress');
    expect(reloadedProduct.description).toBe(
      'Relaxed linen dress with a lightweight drape.',
    );
    expect(reloadedCategory.name).toBe('Dresses');
    expect(reloadedTranslation.title).toBe('Váy lanh cuối tuần');
    expect(reloadedTranslation.description).toBe('Mô tả tiếng Việt');
  });

  it('rejects duplicate and unsupported translation rows, then cascades deletes', async () => {
    await em.persistAndFlush([
      em.create(ProductTranslationEntity, {
        product,
        language: 'vi',
        title: 'Váy lanh',
      }),
      em.create(CategoryTranslationEntity, {
        category,
        language: 'vi',
        name: 'Váy',
      }),
    ]);

    await expect(sql.query(
      `insert into category_translations
        (id, created_at, updated_at, category_id, language, name)
       values ($1, now(), now(), $2, 'vi', 'Trùng')`,
      [randomUUID(), category.id],
    )).rejects.toThrow(/unique|duplicate/i);

    await expect(sql.query(
      `insert into category_translations
        (id, created_at, updated_at, category_id, language, name)
       values ($1, now(), now(), $2, 'fr', 'Robes')`,
      [randomUUID(), category.id],
    )).rejects.toThrow(/check|violat/i);

    await expect(sql.query(
      `insert into product_translations
        (id, created_at, updated_at, product_id, language, title)
       values ($1, now(), now(), $2, 'vi', 'Trùng')`,
      [randomUUID(), product.id],
    )).rejects.toThrow(/unique|duplicate/i);

    await expect(sql.query(
      `insert into product_translations
        (id, created_at, updated_at, product_id, language, title)
       values ($1, now(), now(), $2, 'fr', 'Robe en lin')`,
      [randomUUID(), product.id],
    )).rejects.toThrow(/check|violat/i);

    await sql.query('delete from products where id = $1', [product.id]);
    await sql.query('delete from categories where id = $1', [category.id]);

    const remaining = await sql.query<{
      product_count: string;
      category_count: string;
    }>(`
      select
        (select count(*)::text from product_translations where product_id = $1)
          as product_count,
        (select count(*)::text from category_translations where category_id = $2)
          as category_count
    `, [product.id, category.id]);

    expect(remaining.rows[0]).toEqual({
      product_count: '0',
      category_count: '0',
    });
  });
});
