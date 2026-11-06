import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { API_GLOBAL_PREFIX } from '~/platform/http/api-global-prefix';
import { seedLocations } from '../../database/seeds/location.seed';
import type * as BootstrapAppModule from '~/bootstrap/app.module';
import { createTestDatabase, dropTestDatabase, type TestDatabaseContext } from '../support/test-postgres';

jest.setTimeout(180_000);

const API_PREFIX = `/${API_GLOBAL_PREFIX}`;
const LOCATIONS_PATH = `${API_PREFIX}/locations`;
const EXPECTED_COUNTRY_COUNT = 250;
const EXPECTED_ADMINISTRATIVE_AREA_COUNT = 3_863;
const EXPECTED_VIETNAM_AREA_COUNT = 34;
const EXPECTED_CACHE_CONTROL =
  'public, max-age=86400, stale-while-revalidate=604800';

type CountRow = { count: number };

describe('location reference data (integration)', () => {
  let testDb: TestDatabaseContext;
  let app: INestApplication<App>;
  let entityManager: EntityManager;
  let storageRoot: string;

  beforeAll(async () => {
    testDb = await createTestDatabase('location_reference_int', { fresh: true });
    storageRoot = await mkdtemp(
      path.join(os.tmpdir(), 'api-location-reference-int-'),
    );

    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = testDb.rootConfig.host;
    process.env.DB_PORT = String(testDb.rootConfig.port);
    process.env.DB_USER = testDb.rootConfig.user;
    process.env.DB_PASSWORD = testDb.rootConfig.password;
    process.env.DB_NAME = testDb.dbName;
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.BCRYPT_SALT_ROUNDS = '4';
    process.env.CACHE_DRIVER = 'memory';
    process.env.RATE_LIMIT_DRIVER = 'memory';
    process.env.QUEUE_DRIVER = 'inline';
    process.env.MAIL_DRIVER = 'logger';
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_ROOT = storageRoot;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('~/bootstrap/app.module') as typeof BootstrapAppModule;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();

    entityManager = app.get(EntityManager);
  });

  afterAll(async () => {
    await app?.close();
    if (storageRoot) {
      await rm(storageRoot, { recursive: true, force: true });
    }
    if (testDb) {
      await dropTestDatabase(testDb);
    }
  });

  async function countRows(sql: string): Promise<number> {
    const rows = await entityManager.getConnection().execute<CountRow[]>(sql);
    return rows[0].count;
  }

  it('returns 503 from location endpoints when no current dataset version exists', async () => {
    const countries = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries`)
      .expect(503);

    expect(countries.body).toMatchObject({
      code: 'LOCATION_DATASET_UNAVAILABLE',
      message: 'Location reference dataset is unavailable',
    });
    expect(countries.headers['cache-control']).toBeUndefined();

    const areas = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries/VN/administrative-areas`)
      .expect(503);

    expect(areas.body).toMatchObject({
      code: 'LOCATION_DATASET_UNAVAILABLE',
    });

    const rules = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries/US/address-rules`)
      .expect(503);

    expect(rules.body).toMatchObject({
      code: 'LOCATION_DATASET_UNAVAILABLE',
    });
  });

  it('seeds the pinned dataset with 250 countries and 3,863 administrative areas', async () => {
    await seedLocations(entityManager);

    expect(
      await countRows(
        'select count(*)::int as count from location_countries where is_active = true',
      ),
    ).toBe(EXPECTED_COUNTRY_COUNT);
    expect(
      await countRows(
        'select count(*)::int as count from location_administrative_areas where is_active = true',
      ),
    ).toBe(EXPECTED_ADMINISTRATIVE_AREA_COUNT);

    const versions = await entityManager.getConnection().execute<
      Array<{
        version: string;
        source: string;
        checksum: string;
        is_current: boolean;
      }>
    >(
      `
        select version, source, checksum, is_current
        from location_dataset_versions
      `,
    );

    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      version: 'dr5hn-v5.2.0-export.1+vn-54cdb052',
      is_current: true,
    });
    expect(versions[0].checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(versions[0].source).toContain('dr5hn');
    expect(versions[0].source).toContain('vietnam-administrative-divisions');

    // The overrides file is part of the dataset checksum, so changing it
    // produces a new version instead of silently reusing the old one.
    const referenceDir = path.resolve(
      __dirname,
      '../../database/reference/locations',
    );
    const checksum = createHash('sha256');
    for (const file of [
      'countries.json',
      'administrative-areas.json',
      'postal-code-requiredness.json',
      'address-rule-overrides.json',
    ]) {
      checksum.update(readFileSync(path.join(referenceDir, file)));
    }
    expect(versions[0].checksum).toBe(checksum.digest('hex'));

    expect(
      await countRows(
        'select count(*)::int as count from country_address_rules',
      ),
    ).toBe(5);

    const overrides = await entityManager.getConnection().execute<
      Array<{ country_code: string; rules: unknown }>
    >(
      `
        select country_code, rules
        from country_address_rules
        order by country_code asc
      `,
    );

    expect(overrides.map((row) => row.country_code)).toEqual([
      'GB',
      'HK',
      'JP',
      'US',
      'VN',
    ]);
    expect(
      overrides.find((row) => row.country_code === 'US')?.rules,
    ).toEqual({ labels: { subdivision: 'State', zip: 'ZIP code' } });
    expect(
      overrides.find((row) => row.country_code === 'HK')?.rules,
    ).toEqual({ hidden: ['zip'], labels: { subdivision: 'District' } });
  });

  it('is idempotent and deactivates rows the dataset no longer contains', async () => {
    await entityManager.getConnection().execute(
      `
        insert into location_administrative_areas
          (code, country_code, name, type, is_active, created_at, updated_at)
        values
          ('VN-999', 'VN', 'Removed Province', 'province', true, now(), now())
      `,
    );

    await entityManager.getConnection().execute(
      `
        insert into country_address_rules
          (country_code, rules, created_at, updated_at)
        values
          ('AS', '{"labels":{"zip":"Removed"}}'::jsonb, now(), now())
      `,
    );

    await seedLocations(entityManager);

    const removed = await entityManager.getConnection().execute<
      Array<{ is_active: boolean }>
    >(
      `
        select is_active
        from location_administrative_areas
        where code = 'VN-999'
      `,
    );

    expect(removed).toEqual([{ is_active: false }]);
    expect(
      await countRows(
        'select count(*)::int as count from location_administrative_areas where is_active = true',
      ),
    ).toBe(EXPECTED_ADMINISTRATIVE_AREA_COUNT);
    expect(
      await countRows(
        'select count(*)::int as count from location_dataset_versions',
      ),
    ).toBe(1);
    expect(
      await countRows(
        'select count(*)::int as count from country_address_rules',
      ),
    ).toBe(5);
    expect(
      await countRows(
        'select count(*)::int as count from country_address_rules where country_code = \'AS\'',
      ),
    ).toBe(0);
  });

  it('serves the pinned Vietnam override with 34 provincial units', async () => {
    const response = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries/vn/administrative-areas`)
      .expect(200);

    expect(response.body).toHaveLength(EXPECTED_VIETNAM_AREA_COUNT);
    expect(response.body).toEqual(
      expect.arrayContaining([{ code: 'VN-01', name: 'Hanoi' }]),
    );
    expect(response.body.map((area: { code: string }) => area.code)).not.toContain(
      'VN-999',
    );
  });

  it('returns active countries sorted by name with subdivision and postal metadata', async () => {
    const response = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries`)
      .expect(200);

    expect(response.body).toHaveLength(EXPECTED_COUNTRY_COUNT);

    const expectedOrder = await entityManager.getConnection().execute<
      Array<{ name: string }>
    >(
      `
        select name
        from location_countries
        where is_active = true
        order by name asc, code asc
      `,
    );

    expect(response.body.map((country: { name: string }) => country.name)).toEqual(
      expectedOrder.map((row) => row.name),
    );

    expect(response.body.find((country: { code: string }) => country.code === 'VN')).toEqual({
      code: 'VN',
      name: 'Vietnam',
      has_administrative_areas: true,
      postal_code_required: false,
    });
    expect(
      response.body.find((country: { code: string }) => country.code === 'US'),
    ).toMatchObject({ postal_code_required: true });
    expect(
      response.body.find((country: { code: string }) => country.code === 'AS'),
    ).toMatchObject({ has_administrative_areas: false });
  });

  it('serves merged address rules for overridden countries without storing generated defaults', async () => {
    const jp = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries/jp/address-rules`)
      .expect(200);

    expect(jp.body).toEqual({
      country_code: 'JP',
      fields: [
        {
          key: 'zip',
          label: 'Postal code',
          visible: true,
          required: true,
          control: 'text',
          autocomplete: 'postal-code',
        },
        {
          key: 'subdivision',
          label: 'Prefecture',
          visible: true,
          required: true,
          control: 'select',
          autocomplete: 'address-level1',
        },
        {
          key: 'address_1',
          label: 'Street',
          visible: true,
          required: true,
          control: 'text',
          autocomplete: 'address-line1',
        },
        {
          key: 'address_2',
          label: 'Apt / Suite / Other',
          visible: true,
          required: false,
          control: 'text',
          autocomplete: 'address-line2',
        },
        {
          key: 'full_name',
          label: 'Full Name',
          visible: true,
          required: true,
          control: 'text',
          autocomplete: 'name',
        },
        {
          key: 'city',
          label: 'City',
          visible: true,
          required: true,
          control: 'text',
          autocomplete: 'address-level2',
        },
        {
          key: 'phone',
          label: 'Phone',
          visible: true,
          required: true,
          control: 'tel',
          autocomplete: 'tel',
        },
      ],
    });

    const us = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries/US/address-rules`)
      .expect(200);
    expect(us.body.fields.find((field: { key: string }) => field.key === 'subdivision'))
      .toMatchObject({ label: 'State', required: true, control: 'select' });
    expect(us.body.fields.find((field: { key: string }) => field.key === 'zip'))
      .toMatchObject({ label: 'ZIP code', required: true, visible: true });

    const gb = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries/GB/address-rules`)
      .expect(200);
    expect(gb.body.fields.find((field: { key: string }) => field.key === 'subdivision'))
      .toMatchObject({ visible: false, required: false });
    expect(gb.body.fields.find((field: { key: string }) => field.key === 'zip'))
      .toMatchObject({ label: 'Postcode', visible: true, required: true });

    const vn = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries/VN/address-rules`)
      .expect(200);
    expect(vn.body.fields.find((field: { key: string }) => field.key === 'subdivision'))
      .toMatchObject({ label: 'Province/City', required: true, control: 'select' });
    expect(vn.body.fields.find((field: { key: string }) => field.key === 'zip'))
      .toMatchObject({ visible: true, required: false });

    const hk = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries/HK/address-rules`)
      .expect(200);
    expect(hk.body.fields.find((field: { key: string }) => field.key === 'zip'))
      .toMatchObject({ visible: false, required: false });
    expect(hk.body.fields.find((field: { key: string }) => field.key === 'subdivision'))
      .toMatchObject({ label: 'District', visible: true, required: true });
    expect(hk.body.fields).toHaveLength(7);
  });

  it('returns 404 for unknown and inactive countries, and 200 [] for a known country without areas', async () => {
    const unknown = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries/ZZ/administrative-areas`)
      .expect(404);

    expect(unknown.body).toMatchObject({ code: 'LOCATION_COUNTRY_NOT_FOUND' });
    expect(unknown.headers['cache-control']).toBeUndefined();

    await entityManager.getConnection().execute(
      `
        insert into location_countries
          (code, name, postal_code_required, is_active, created_at, updated_at)
        values
          ('ZY', 'Inactive Example', false, false, now(), now())
      `,
    );

    const inactive = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries/zy/administrative-areas`)
      .expect(404);

    expect(inactive.body).toMatchObject({ code: 'LOCATION_COUNTRY_NOT_FOUND' });

    const unknownRules = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries/ZZ/address-rules`)
      .expect(404);

    expect(unknownRules.body).toMatchObject({
      code: 'LOCATION_COUNTRY_NOT_FOUND',
    });
    expect(unknownRules.headers['cache-control']).toBeUndefined();

    const inactiveRules = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries/zy/address-rules`)
      .expect(404);

    expect(inactiveRules.body).toMatchObject({
      code: 'LOCATION_COUNTRY_NOT_FOUND',
    });

    const empty = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries/as/administrative-areas`)
      .expect(200);

    expect(empty.body).toEqual([]);
  });

  it('sends the agreed cache header and a strong ETag that supports conditional 304 responses', async () => {
    const countries = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries`)
      .expect(200);

    const countriesEtag = countries.headers.etag;
    expect(countries.headers['cache-control']).toBe(EXPECTED_CACHE_CONTROL);
    expect(countriesEtag).toMatch(/^"[a-f0-9]{64}"$/);

    const countriesNotModified = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries`)
      .set('If-None-Match', countriesEtag)
      .expect(304);

    expect(countriesNotModified.headers.etag).toBe(countriesEtag);
    expect(countriesNotModified.text ?? '').toBe('');

    const areas = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries/VN/administrative-areas`)
      .expect(200);

    const areasEtag = areas.headers.etag;
    expect(areas.headers['cache-control']).toBe(EXPECTED_CACHE_CONTROL);
    expect(areasEtag).toMatch(/^"[a-f0-9]{64}"$/);
    expect(areasEtag).not.toBe(countriesEtag);

    const areasNotModified = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries/vn/administrative-areas`)
      .set('If-None-Match', areasEtag)
      .expect(304);

    expect(areasNotModified.headers.etag).toBe(areasEtag);
    expect(areasNotModified.text ?? '').toBe('');

    const rules = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries/JP/address-rules`)
      .expect(200);

    const rulesEtag = rules.headers.etag;
    expect(rules.headers['cache-control']).toBe(EXPECTED_CACHE_CONTROL);
    expect(rulesEtag).toMatch(/^"[a-f0-9]{64}"$/);
    expect(rulesEtag).not.toBe(countriesEtag);
    expect(rulesEtag).not.toBe(areasEtag);

    const rulesNotModified = await request(app.getHttpServer())
      .get(`${LOCATIONS_PATH}/countries/jp/address-rules`)
      .set('If-None-Match', rulesEtag)
      .expect(304);

    expect(rulesNotModified.headers.etag).toBe(rulesEtag);
    expect(rulesNotModified.text ?? '').toBe('');
  });
});
