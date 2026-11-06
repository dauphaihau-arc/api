import { randomUUID } from 'node:crypto';
import { MikroORM } from '@mikro-orm/postgresql';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { CountryAddressRuleEntity } from '~/domains/location/infra/persistence/entities/country-address-rule.entity';
import { LocationAdministrativeAreaEntity } from '~/domains/location/infra/persistence/entities/location-administrative-area.entity';
import { LocationCountryEntity } from '~/domains/location/infra/persistence/entities/location-country.entity';
import { LocationDatasetVersionEntity } from '~/domains/location/infra/persistence/entities/location-dataset-version.entity';
import { UserAddressEntity } from '~/domains/user/infra/persistence/entities/user-address.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { backfillUserAddressLocations } from '~/domains/user/infra/backfill-user-address-locations';
import { seedLocations } from '../../database/seeds/location.seed';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';
import type { TestDatabaseContext } from '../support/test-postgres';

jest.setTimeout(240_000);

type AddressLocationRow = {
  id: string;
  country: string;
  state: string;
  country_code: string | null;
  state_code: string | null;
  country_text: string | null;
  state_text: string | null;
  updated_at: string;
};

type LegacyAddressSeed = {
  key: string;
  country: string;
  state: string;
};

describe('saved address location backfill (integration)', () => {
  let testDb: TestDatabaseContext;
  let orm: MikroORM;
  let userId: string;
  const addressIds = new Map<string, string>();

  beforeAll(async () => {
    testDb = await createTestDatabase('address_location_backfill_int', {
      fresh: true,
    });

    orm = await MikroORM.init({
      ...buildDatabaseConfig(
        {
          DATABASE_URL: undefined,
          DB_HOST: testDb.rootConfig.host,
          DB_PORT: String(testDb.rootConfig.port),
          DB_USER: testDb.rootConfig.user,
          DB_PASSWORD: testDb.rootConfig.password,
          DB_NAME: testDb.dbName,
          NODE_ENV: 'test',
        },
        { debug: false },
      ),
      entities: [
        UserEntity,
        UserAddressEntity,
        LocationCountryEntity,
        LocationAdministrativeAreaEntity,
        LocationDatasetVersionEntity,
        CountryAddressRuleEntity,
      ],
      ensureDatabase: false,
    });

    await seedLocations(orm.em.fork());

    const connection = orm.em.getConnection();
    userId = randomUUID();
    await connection.execute(
      `
        insert into users (id, created_at, updated_at, email, status, version)
        values (?, now(), now(), ?, 'active', 1)
      `,
      [userId, `backfill-${userId}@example.com`],
    );

    const seeds: LegacyAddressSeed[] = [
      { key: 'unique-name', country: 'United States', state: 'california' },
      { key: 'unique-code', country: 'US', state: 'us-ca' },
      { key: 'accent-name', country: 'Albania', state: 'Durres' },
      { key: 'accent-country', country: 'Curacao', state: '' },
      { key: 'ambiguous', country: 'Azerbaijan', state: 'Lankaran' },
      { key: 'unmatched-subdivision', country: 'United States', state: 'Atlantis' },
      { key: 'unmatched-country', country: 'Narnia', state: 'Nowhere' },
    ];

    for (const seed of seeds) {
      const id = randomUUID();
      addressIds.set(seed.key, id);
      await connection.execute(
        `
          insert into user_addresses (
            id, created_at, updated_at, user_id, full_name, address1, city,
            state, zip, country, phone, is_primary
          )
          values (?, now(), now(), ?, ?, ?, ?, ?, ?, ?, ?, false)
        `,
        [
          id,
          userId,
          'Backfill Buyer',
          '1 Test Street',
          'Test City',
          seed.state,
          '00000',
          seed.country,
          '0900000000',
        ],
      );
    }
  });

  afterAll(async () => {
    if (orm) {
      await orm.close(true);
    }
    if (testDb) {
      await dropTestDatabase(testDb);
    }
  });

  async function readRow(key: string): Promise<AddressLocationRow> {
    const id = addressIds.get(key);

    if (!id) {
      throw new Error(`Unknown address seed: ${key}`);
    }

    const rows = await orm.em.getConnection().execute<AddressLocationRow[]>(
      `
        select id, country, state, country_code, state_code, country_text, state_text, updated_at
        from user_addresses
        where id = ?
      `,
      [id],
    );

    return rows[0]!;
  }

  async function readAllRows(): Promise<AddressLocationRow[]> {
    return orm.em.getConnection().execute<AddressLocationRow[]>(
      `
        select id, country, state, country_code, state_code, country_text, state_text, updated_at
        from user_addresses
        order by id asc
      `,
    );
  }

  it('resolves unique names and codes, preserves ambiguous and unmatched text, and reruns idempotently', async () => {
    const firstRun = await backfillUserAddressLocations(orm.em.fork(), {
      batchSize: 2,
    });

    expect(firstRun).toEqual({
      scanned: 7,
      updated: 7,
      unchanged: 0,
      countries: { matched: 6, unmatched: 1 },
      subdivisions: { matched: 3, ambiguous: 1, unmatched: 2 },
    });

    expect(await readRow('unique-name')).toMatchObject({
      country: 'United States',
      state: 'California',
      country_code: 'US',
      state_code: 'US-CA',
      country_text: null,
      state_text: null,
    });

    expect(await readRow('unique-code')).toMatchObject({
      country: 'United States',
      state: 'California',
      country_code: 'US',
      state_code: 'US-CA',
      country_text: null,
      state_text: null,
    });

    expect(await readRow('accent-name')).toMatchObject({
      country: 'Albania',
      state: 'Durrës',
      country_code: 'AL',
      state_code: 'AL-02',
      country_text: null,
      state_text: null,
    });

    expect(await readRow('accent-country')).toMatchObject({
      country: 'Curaçao',
      country_code: 'CW',
      state_code: null,
      country_text: null,
      state_text: null,
    });

    expect(await readRow('ambiguous')).toMatchObject({
      country: 'Azerbaijan',
      state: 'Lankaran',
      country_code: 'AZ',
      state_code: null,
      country_text: null,
      state_text: 'Lankaran',
    });

    expect(await readRow('unmatched-subdivision')).toMatchObject({
      country: 'United States',
      state: 'Atlantis',
      country_code: 'US',
      state_code: null,
      country_text: null,
      state_text: 'Atlantis',
    });

    expect(await readRow('unmatched-country')).toMatchObject({
      country: 'Narnia',
      state: 'Nowhere',
      country_code: null,
      state_code: null,
      country_text: 'Narnia',
      state_text: 'Nowhere',
    });

    const rowsAfterFirstRun = await readAllRows();

    const secondRun = await backfillUserAddressLocations(orm.em.fork());

    // Only the address whose country could not be resolved is still in scope;
    // everything with a resolved country code is already final.
    expect(secondRun).toEqual({
      scanned: 1,
      updated: 0,
      unchanged: 1,
      countries: { matched: 0, unmatched: 1 },
      subdivisions: { matched: 0, ambiguous: 0, unmatched: 1 },
    });

    expect(await readAllRows()).toEqual(rowsAfterFirstRun);
  });
});
