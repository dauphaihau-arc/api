/**
 * Boots the real API over HTTP on a fresh, migrated PostgreSQL database for the
 * storefront category-redirect browser journey.
 *
 * Categories are inserted before the category-identity migration runs, so the
 * migration captures the persisted slugs and the permanently owned legacy path
 * aliases from real rows. The harness prints a JSON ready line carrying the API
 * origin and the fixture paths; the host storefront is built separately and
 * pointed at this origin.
 *
 * Run with:
 *   node -r ts-node/register/transpile-only -r tsconfig-paths/register \
 *     test/support/category-redirect-e2e-api.ts
 */
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/postgresql';
import { Client } from 'pg';
import { Test } from '@nestjs/testing';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { LocalFileStorageService } from '~/integrations/storage/infra/local-file-storage.service';
import { validationExceptionFactory } from '~/platform/pipes/validation-exception.factory';
import { API_GLOBAL_PREFIX } from '~/platform/http/api-global-prefix';
import { CategoryIdentityGenerationInterceptor } from '~/domains/category/api/rest/category-identity-generation.interceptor';
import type * as BootstrapAppModule from '~/bootstrap/app.module';
import { createTestDatabase, dropTestDatabase, type TestDatabaseContext } from './test-postgres';

const PORT = Number(process.env.CATEGORY_E2E_API_PORT ?? 4020);
const WEB_PORT = Number(process.env.CATEGORY_E2E_WEB_PORT ?? 4120);
const PREFIX = `/${API_GLOBAL_PREFIX}`;

/**
 * Seeded before the identity migration: `order` fixes the UUID ordering so the
 * ready-line fixtures are deterministic. `legacyPath` is the hierarchical path
 * the migration derives from the name/ancestry, and is the URL a shopper may
 * still hold. `Gaming Mice` / `Gaming_Mice` deliberately normalize to the same
 * slug so the redirect must key off the public identity.
 */
const SEED = [
  {
    id: '00000000-0000-4000-a000-000000000001',
    parentId: null,
    name: 'Home',
    rank: 1,
  },
  {
    id: '00000000-0000-4000-a000-000000000002',
    parentId: '00000000-0000-4000-a000-000000000001',
    name: 'Caf\u00e9 Cadeaux',
    rank: 1,
  },
  {
    id: '00000000-0000-4000-a000-000000000003',
    parentId: null,
    name: 'Gaming Mice',
    rank: 2,
  },
  {
    id: '00000000-0000-4000-a000-000000000004',
    parentId: null,
    name: 'Gaming_Mice',
    rank: 3,
  },
] as const;

const LEGACY_PATH_BY_NAME: Record<string, string> = {
  Home: '/c/home',
  'Caf\u00e9 Cadeaux': '/c/home/caf\u00e9-cadeaux',
  'Gaming Mice': '/c/gaming-mice',
  Gaming_Mice: '/c/gaming_mice',
};

type HarnessResources = {
  app?: INestApplication;
  testDb?: TestDatabaseContext;
  storageRoot?: string;
};

const resources: HarnessResources = {};
let cleanupStarted = false;
let stopping = false;

async function cleanup(): Promise<void> {
  if (cleanupStarted) {
    return;
  }

  cleanupStarted = true;

  await resources.app?.close().catch(() => undefined);
  if (resources.testDb) await dropTestDatabase(resources.testDb).catch(() => undefined);
  if (resources.storageRoot) await rm(resources.storageRoot, { recursive: true, force: true }).catch(() => undefined);
}

/**
 * Seeds raw category rows with no identity columns, then runs the identity
 * migration so slugs and legacy aliases are derived from real persisted rows.
 */
async function seedCategoriesWithPersistedAliases(testDb: TestDatabaseContext): Promise<void> {
  const sql = new Client({
    host: testDb.rootConfig.host,
    port: testDb.rootConfig.port,
    user: testDb.rootConfig.user,
    password: testDb.rootConfig.password,
    database: testDb.dbName,
  });
  await sql.connect();

  const env = {
    ...process.env,
    DATABASE_URL: undefined,
    DB_HOST: testDb.rootConfig.host,
    DB_PORT: String(testDb.rootConfig.port),
    DB_USER: testDb.rootConfig.user,
    DB_PASSWORD: testDb.rootConfig.password,
    DB_NAME: testDb.dbName,
  };
  const orm = await MikroORM.init(buildDatabaseConfig(env, { includeEntityGlobs: true, debug: false }));

  try {
    await orm.getMigrator().down();
    for (const category of SEED) {
      await sql.query(
        `insert into categories (id, created_at, updated_at, name, rank, parent_id)
         values ($1, now(), now(), $2, $3, $4)`,
        [category.id, category.name, category.rank, category.parentId],
      );
    }
    await orm.getMigrator().up();
  }
  finally {
    await orm.close(true);
    await sql.end();
  }
}

async function readFixtures(testDb: TestDatabaseContext) {
  const sql = new Client({
    host: testDb.rootConfig.host,
    port: testDb.rootConfig.port,
    user: testDb.rootConfig.user,
    password: testDb.rootConfig.password,
    database: testDb.dbName,
  });
  await sql.connect();

  try {
    const rows = await sql.query<{ name: string; public_id: string; slug: string }>(
      'select name, public_id::text, slug from categories order by name',
    );
    const byName = new Map(rows.rows.map((row) => [row.name, row]));

    return SEED.map((category) => {
      const row = byName.get(category.name);

      if (!row) {
        throw new Error(`missing seeded category ${category.name}`);
      }

      return {
        name: category.name,
        publicId: row.public_id,
        slug: row.slug,
        legacyPath: LEGACY_PATH_BY_NAME[category.name],
        canonicalPath: `/c/${row.slug}-c${row.public_id}`,
      };
    });
  }
  finally {
    await sql.end();
  }
}

async function main() {
  const testDb = await createTestDatabase('category_redirect_e2e', { fresh: true });
  resources.testDb = testDb;
  if (stopping) return;

  await seedCategoriesWithPersistedAliases(testDb);
  if (stopping) return;

  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = testDb.rootConfig.host;
  process.env.DB_PORT = String(testDb.rootConfig.port);
  process.env.DB_USER = testDb.rootConfig.user;
  process.env.DB_PASSWORD = testDb.rootConfig.password;
  process.env.DB_NAME = testDb.dbName;
  const databaseUrl = new URL('postgresql://localhost');
  databaseUrl.hostname = testDb.rootConfig.host;
  databaseUrl.port = String(testDb.rootConfig.port);
  databaseUrl.username = encodeURIComponent(testDb.rootConfig.user);
  databaseUrl.password = encodeURIComponent(testDb.rootConfig.password);
  databaseUrl.pathname = testDb.dbName;
  process.env.DATABASE_URL = databaseUrl.toString();
  process.env.JWT_ACCESS_SECRET = 'category-e2e-access-secret';
  process.env.JWT_REFRESH_SECRET = 'category-e2e-refresh-secret';
  process.env.BCRYPT_SALT_ROUNDS = '4';
  process.env.CACHE_DRIVER = 'memory';
  process.env.RATE_LIMIT_DRIVER = 'memory';
  process.env.RATE_LIMIT_LIMIT = '100000';
  process.env.QUEUE_DRIVER = 'inline';
  process.env.MAIL_DRIVER = 'logger';
  process.env.STORAGE_DRIVER = 'local';
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'category-e2e-api-'));
  resources.storageRoot = storageRoot;
  if (stopping) return;
  process.env.STORAGE_LOCAL_ROOT = storageRoot;
  process.env.AUTH_COOKIE_SAME_SITE = 'lax';
  process.env.AUTH_COOKIE_SECURE = 'false';
  process.env.AUTH_COOKIE_PATH = '/';
  delete process.env.AUTH_COOKIE_DOMAIN;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require('~/bootstrap/app.module') as typeof BootstrapAppModule;

  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StorageService)
    .useValue(new LocalFileStorageService({ driver: 'local', localRoot: storageRoot }))
    .compile();

  const app = moduleFixture.createNestApplication();
  resources.app = app;
  if (stopping) return;
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.setGlobalPrefix(PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });
  app.useGlobalInterceptors(new CategoryIdentityGenerationInterceptor());
  // The storefront browser calls this API cross-origin; allow exactly the
  // storefront origin, mirroring the deployment's CORS_ALLOWED_ORIGINS.
  app.enableCors({
    origin: [`http://127.0.0.1:${WEB_PORT}`],
    credentials: true,
  });
  await app.listen(PORT);
  if (stopping) return;

  const fixtures = await readFixtures(testDb);

  process.stdout.write(`CATEGORY_E2E_READY ${JSON.stringify({
    origin: `http://127.0.0.1:${PORT}`,
    fixtures,
  })}\n`);
}

const startup = main();

function stop(code: number): void {
  if (stopping) return;
  stopping = true;
  void startup.catch(() => undefined).then(cleanup).then(
    () => process.exit(code),
    () => process.exit(1),
  );
}

process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));

void startup.catch((error) => {
  process.stderr.write(`CATEGORY_E2E_FAILED ${String(error?.stack ?? error)}\n`);
  stop(1);
});
