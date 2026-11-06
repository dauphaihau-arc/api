import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Agent } from 'supertest';
import type { App } from 'supertest/types';
import { API_GLOBAL_PREFIX } from '~/platform/http/api-global-prefix';
import { validationExceptionFactory } from '~/platform/pipes/validation-exception.factory';
import { seedAuthReferenceData } from '../../database/seeds/auth.seed';
import { seedLocations } from '../../database/seeds/location.seed';
import type * as BootstrapAppModule from '~/bootstrap/app.module';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';
import type { TestDatabaseContext } from '../support/test-postgres';

jest.setTimeout(240_000);

const API_PREFIX = `/${API_GLOBAL_PREFIX}`;
const ADDRESSES_PATH = `${API_PREFIX}/me/addresses`;
const VALID_TEST_PASSWORD = 'Password123!';

type AddressResponse = {
  id: string;
  full_name: string;
  address_1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  country_code: string | null;
  state_code: string | null;
  phone: string;
  is_primary: boolean;
  country_text?: string;
  state_text?: string;
};

type AddressLocationRow = {
  country: string;
  state: string;
  country_code: string | null;
  state_code: string | null;
  country_text: string | null;
  state_text: string | null;
};

type TestBuyer = { agent: Agent; userId: string };

function randomForwardedIp(): string {
  return `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
}

const baseAddress = {
  full_name: 'Address Buyer',
  address_1: '123 Main St',
  city: 'Los Angeles',
  zip: '90001',
  phone: '+14155552671',
};

describe('saved address location codes (integration)', () => {
  let testDb: TestDatabaseContext;
  let app: INestApplication<App>;
  let entityManager: EntityManager;
  let storageRoot: string;
  let buyerCounter = 0;
  let buyer: TestBuyer;

  beforeAll(async () => {
    testDb = await createTestDatabase('user_address_location_int', { fresh: true });
    storageRoot = await mkdtemp(
      path.join(os.tmpdir(), 'api-user-address-location-int-'),
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
    process.env.RATE_LIMIT_LIMIT = '10000';
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    app.setGlobalPrefix(API_PREFIX);
    await app.init();

    entityManager = app.get(EntityManager);
    await seedAuthReferenceData(entityManager.fork());
    await seedLocations(entityManager.fork());
    buyer = await registerBuyer();
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

  async function registerBuyer(): Promise<TestBuyer> {
    buyerCounter += 1;
    const agent = request.agent(app.getHttpServer());
    const email = `address-${Date.now()}-${buyerCounter}@example.com`;

    const response = await agent
      .post(`${API_PREFIX}/auth/register`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({ email, password: VALID_TEST_PASSWORD, displayName: 'Address Buyer' })
      .expect(201);

    return { agent, userId: response.body.user.id as string };
  }

  async function createAddress(
    account: TestBuyer,
    body: Record<string, unknown>,
    expectedStatus = 201,
  ) {
    return account.agent
      .post(ADDRESSES_PATH)
      .set('Idempotency-Key', randomUUID())
      .send({ ...baseAddress, ...body })
      .expect(expectedStatus);
  }

  async function updateAddress(
    account: TestBuyer,
    addressId: string,
    body: Record<string, unknown>,
    expectedStatus = 200,
  ) {
    return account.agent
      .patch(`${ADDRESSES_PATH}/${addressId}`)
      .set('Idempotency-Key', randomUUID())
      .send(body)
      .expect(expectedStatus);
  }

  async function readAddress(account: TestBuyer, addressId: string) {
    const response = await account.agent
      .get(`${ADDRESSES_PATH}/${addressId}`)
      .expect(200);

    return response.body.address as AddressResponse;
  }

  async function readLocationRow(addressId: string): Promise<AddressLocationRow> {
    const rows = await entityManager.getConnection().execute<AddressLocationRow[]>(
      `
        select country, state, country_code, state_code, country_text, state_text
        from user_addresses
        where id = ?
      `,
      [addressId],
    );

    return rows[0];
  }

  async function setCountryActive(code: string, isActive: boolean): Promise<void> {
    await entityManager.getConnection().execute(
      'update location_countries set is_active = ? where code = ?',
      [isActive, code],
    );
  }

  async function setAreaActive(code: string, isActive: boolean): Promise<void> {
    await entityManager.getConnection().execute(
      'update location_administrative_areas set is_active = ? where code = ?',
      [isActive, code],
    );
  }

  async function setAddressContact(
    addressId: string,
    phone: string,
    zip: string,
  ): Promise<void> {
    await entityManager.getConnection().execute(
      'update user_addresses set phone = ?, zip = ? where id = ?',
      [phone, zip, addressId],
    );
  }

  it('creates a coded address and derives the legacy display names', async () => {
    const response = await createAddress(buyer, {
      country_code: 'US',
      state_code: 'US-CA',
    });

    const address = response.body.address as AddressResponse;
    expect(address).toMatchObject({
      country: 'United States',
      state: 'California',
      country_code: 'US',
      state_code: 'US-CA',
    });
    expect(address.country_text).toBeUndefined();
    expect(address.state_text).toBeUndefined();

    const row = await readLocationRow(address.id);
    expect(row).toMatchObject({
      country: 'United States',
      state: 'California',
      country_code: 'US',
      state_code: 'US-CA',
      country_text: null,
      state_text: null,
    });
  });

  it('requires a state code when the selected country publishes areas', async () => {
    const response = await createAddress(
      buyer,
      { country_code: 'US' },
      400,
    );

    expect(response.body).toMatchObject({
      code: 'ADDRESS_STATE_CODE_REQUIRED',
    });
  });

  it('rejects free-text subdivision when the country publishes areas', async () => {
    const response = await createAddress(
      buyer,
      { country_code: 'US', state_text: 'Somewhere' },
      400,
    );

    expect(response.body).toMatchObject({
      code: 'ADDRESS_STATE_TEXT_NOT_ALLOWED',
    });
  });

  it('requires the new subdivision data when the country changes', async () => {
    const created = await createAddress(buyer, {
      country_code: 'US',
      state_code: 'US-CA',
    });
    const addressId = created.body.address.id as string;

    const missingSubdivision = await updateAddress(
      buyer,
      addressId,
      { country_code: 'CA' },
      400,
    );
    expect(missingSubdivision.body).toMatchObject({
      code: 'ADDRESS_STATE_CODE_REQUIRED',
    });

    const updated = await updateAddress(buyer, addressId, {
      country_code: 'CA',
      state_code: 'CA-ON',
    });
    expect(updated.body.address).toMatchObject({
      country: 'Canada',
      state: 'Ontario',
      country_code: 'CA',
      state_code: 'CA-ON',
    });
  });

  it('rejects unknown and inactive country or area codes', async () => {
    const unknownCountry = await createAddress(
      buyer,
      { country_code: 'ZZ', state_code: 'ZZ-01' },
      400,
    );
    expect(unknownCountry.body).toMatchObject({
      code: 'ADDRESS_COUNTRY_UNKNOWN',
    });

    const unknownArea = await createAddress(
      buyer,
      { country_code: 'US', state_code: 'US-ZZ' },
      400,
    );
    expect(unknownArea.body).toMatchObject({
      code: 'ADDRESS_STATE_UNKNOWN',
    });

    await setCountryActive('MC', false);
    try {
      const inactiveCountry = await createAddress(
        buyer,
        { country_code: 'MC' },
        400,
      );
      expect(inactiveCountry.body).toMatchObject({
        code: 'ADDRESS_COUNTRY_UNKNOWN',
      });
    }
    finally {
      await setCountryActive('MC', true);
    }

    await setAreaActive('US-WY', false);
    try {
      const inactiveArea = await createAddress(
        buyer,
        { country_code: 'US', state_code: 'US-WY' },
        400,
      );
      expect(inactiveArea.body).toMatchObject({
        code: 'ADDRESS_STATE_UNKNOWN',
      });
    }
    finally {
      await setAreaActive('US-WY', true);
    }
  });

  it('rejects a state code and accepts optional state text for countries without areas', async () => {
    const rejected = await createAddress(
      buyer,
      { country_code: 'MC', state_code: 'MC-01' },
      400,
    );
    expect(rejected.body).toMatchObject({
      code: 'ADDRESS_STATE_CODE_NOT_ALLOWED',
    });

    const coded = await createAddress(buyer, {
      country_code: 'MC',
      state_text: 'Monte Carlo',
      zip: '98000',
    });
    expect(coded.body.address).toMatchObject({
      country: 'Monaco',
      state: 'Monte Carlo',
      country_code: 'MC',
      state_code: null,
    });
  });

  it('creates name-only addresses and resolves known legacy names', async () => {
    const resolved = await createAddress(buyer, {
      country: 'United States',
      state: 'California',
    });
    expect(resolved.body.address).toMatchObject({
      country: 'United States',
      state: 'California',
      country_code: 'US',
      state_code: 'US-CA',
    });

    const unresolvedSubdivision = await createAddress(buyer, {
      country: 'United States',
      state: 'Atlantis',
    });
    const addressId = unresolvedSubdivision.body.address.id as string;
    expect(unresolvedSubdivision.body.address).toMatchObject({
      country: 'United States',
      state: 'Atlantis',
      country_code: 'US',
      state_code: null,
    });

    const row = await readLocationRow(addressId);
    expect(row).toMatchObject({
      country_code: 'US',
      state_code: null,
      country_text: null,
      state_text: 'Atlantis',
    });
  });

  it('keeps name-only rows with null codes readable', async () => {
    const created = await createAddress(buyer, {
      country: 'Narnia',
      state: 'Nowhere',
    });
    const addressId = created.body.address.id as string;

    expect(created.body.address).toMatchObject({
      country: 'Narnia',
      state: 'Nowhere',
      country_code: null,
      state_code: null,
    });

    const read = await readAddress(buyer, addressId);
    expect(read).toMatchObject({
      id: addressId,
      country: 'Narnia',
      state: 'Nowhere',
      country_code: null,
      state_code: null,
    });

    const row = await readLocationRow(addressId);
    expect(row).toMatchObject({
      country: 'Narnia',
      state: 'Nowhere',
      country_code: null,
      state_code: null,
      country_text: 'Narnia',
      state_text: 'Nowhere',
    });
  });

  it('preserves unchanged legacy values on unrelated edits', async () => {
    const created = await createAddress(buyer, {
      country: 'Narnia',
      state: 'Nowhere',
    });
    const addressId = created.body.address.id as string;

    const updated = await updateAddress(buyer, addressId, {
      city: 'Sacramento',
    });
    expect(updated.body.address).toMatchObject({
      city: 'Sacramento',
      country: 'Narnia',
      state: 'Nowhere',
      country_code: null,
      state_code: null,
    });

    const row = await readLocationRow(addressId);
    expect(row).toMatchObject({
      country: 'Narnia',
      state: 'Nowhere',
      country_code: null,
      state_code: null,
      country_text: 'Narnia',
      state_text: 'Nowhere',
    });
  });

  it('preserves unchanged inactive codes but rejects switching to them', async () => {
    const created = await createAddress(buyer, {
      country_code: 'US',
      state_code: 'US-CA',
    });
    const addressId = created.body.address.id as string;

    await setAreaActive('US-CA', false);
    await setAreaActive('US-WY', false);
    try {
      const untouched = await updateAddress(buyer, addressId, {
        city: 'San Diego',
      });
      expect(untouched.body.address).toMatchObject({
        city: 'San Diego',
        country_code: 'US',
        state_code: 'US-CA',
      });

      const resent = await updateAddress(buyer, addressId, {
        country_code: 'US',
        state_code: 'US-CA',
      });
      expect(resent.body.address).toMatchObject({
        country_code: 'US',
        state_code: 'US-CA',
      });

      const switched = await updateAddress(
        buyer,
        addressId,
        { state_code: 'US-WY' },
        400,
      );
      expect(switched.body).toMatchObject({
        code: 'ADDRESS_STATE_UNKNOWN',
      });
    }
    finally {
      await setAreaActive('US-CA', true);
      await setAreaActive('US-WY', true);
    }
  });

  it('clears nullable codes without breaking the legacy name columns', async () => {
    const created = await createAddress(buyer, {
      country_code: 'US',
      state_code: 'US-CA',
    });
    const addressId = created.body.address.id as string;

    const updated = await updateAddress(buyer, addressId, {
      country_code: null,
    });
    expect(updated.body.address).toMatchObject({
      country: 'United States',
      state: 'California',
      country_code: null,
      state_code: null,
    });

    const row = await readLocationRow(addressId);
    expect(row).toMatchObject({
      country: 'United States',
      state: 'California',
      country_code: null,
      state_code: null,
      country_text: 'United States',
      state_text: null,
    });
  });

  it('normalizes valid US, GB, and VN phones to E.164 and normalizes postcodes', async () => {
    const us = await createAddress(buyer, {
      country_code: 'US',
      state_code: 'US-CA',
      phone: '+1 (415) 555-2671',
      zip: ' 90001 ',
    });
    expect(us.body.address).toMatchObject({
      phone: '+14155552671',
      zip: '90001',
    });

    const gb = await createAddress(buyer, {
      country_code: 'GB',
      state_code: 'GB-ENG',
      phone: '020 7946 0958',
      zip: ' sw1a 1aa ',
    });
    expect(gb.body.address).toMatchObject({
      phone: '+442079460958',
      zip: 'SW1A 1AA',
    });

    const vn = await createAddress(buyer, {
      country_code: 'VN',
      state_code: 'VN-24',
      phone: '0912 345 678',
      zip: '700000',
    });
    expect(vn.body.address).toMatchObject({
      phone: '+84912345678',
      zip: '700000',
    });
  });

  it('rejects invalid phones for the resolved country', async () => {
    const us = await createAddress(
      buyer,
      { country_code: 'US', state_code: 'US-CA', phone: '12345' },
      400,
    );
    expect(us.body).toMatchObject({ code: 'ADDRESS_PHONE_INVALID' });

    const gb = await createAddress(
      buyer,
      { country_code: 'GB', state_code: 'GB-ENG', phone: 'not-a-phone' },
      400,
    );
    expect(gb.body).toMatchObject({ code: 'ADDRESS_PHONE_INVALID' });

    const vn = await createAddress(
      buyer,
      { country_code: 'VN', state_code: 'VN-24', phone: '123' },
      400,
    );
    expect(vn.body).toMatchObject({ code: 'ADDRESS_PHONE_INVALID' });
  });

  it('rejects invalid postcodes and requires them for postal countries', async () => {
    const us = await createAddress(
      buyer,
      { country_code: 'US', state_code: 'US-CA', zip: 'ABCDE' },
      400,
    );
    expect(us.body).toMatchObject({ code: 'ADDRESS_POSTCODE_INVALID' });

    const gb = await createAddress(
      buyer,
      { country_code: 'GB', state_code: 'GB-ENG', zip: 'ZZZZ 1ZZ' },
      400,
    );
    expect(gb.body).toMatchObject({ code: 'ADDRESS_POSTCODE_INVALID' });

    const vn = await createAddress(
      buyer,
      { country_code: 'VN', state_code: 'VN-24', zip: 'ABCDE' },
      400,
    );
    expect(vn.body).toMatchObject({ code: 'ADDRESS_POSTCODE_INVALID' });

    const required = await createAddress(
      buyer,
      { country_code: 'US', state_code: 'US-CA', zip: '' },
      400,
    );
    expect(required.body).toMatchObject({ code: 'ADDRESS_POSTCODE_REQUIRED' });
  });

  it('accepts optional postcodes and validator-less country formats', async () => {
    const vn = await createAddress(buyer, {
      country_code: 'VN',
      state_code: 'VN-24',
      zip: '',
    });
    expect(vn.body.address).toMatchObject({ zip: '' });

    const hk = await createAddress(buyer, {
      country_code: 'HK',
      state_code: 'HK-HCW',
      zip: ' abc-123 ',
    });
    expect(hk.body.address).toMatchObject({
      zip: 'ABC-123',
      phone: '+14155552671',
    });
  });

  it('preserves unchanged legacy phone and postcode on unrelated edits', async () => {
    const created = await createAddress(buyer, {
      country_code: 'US',
      state_code: 'US-CA',
    });
    const addressId = created.body.address.id as string;

    await setAddressContact(addressId, '123456789', 'ABCDE');

    const omitted = await updateAddress(buyer, addressId, { city: 'San Jose' });
    expect(omitted.body.address).toMatchObject({
      city: 'San Jose',
      phone: '123456789',
      zip: 'ABCDE',
    });

    const resent = await updateAddress(buyer, addressId, {
      city: 'Oakland',
      phone: '123456789',
      zip: 'abcde',
    });
    expect(resent.body.address).toMatchObject({
      city: 'Oakland',
      phone: '123456789',
      zip: 'ABCDE',
    });

    const changedPhone = await updateAddress(
      buyer,
      addressId,
      { phone: '987654321' },
      400,
    );
    expect(changedPhone.body).toMatchObject({
      code: 'ADDRESS_PHONE_INVALID',
    });

    const changedZip = await updateAddress(
      buyer,
      addressId,
      { zip: 'ZZZZZ' },
      400,
    );
    expect(changedZip.body).toMatchObject({
      code: 'ADDRESS_POSTCODE_INVALID',
    });
  });

  it('enforces the 20 character phone and postcode request limit', async () => {
    const phone = await createAddress(
      buyer,
      { country_code: 'US', state_code: 'US-CA', phone: '1'.repeat(21) },
      400,
    );
    expect(phone.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: {
        fields: expect.arrayContaining([expect.objectContaining({ field: 'phone' })]),
      },
    });

    const zip = await createAddress(
      buyer,
      { country_code: 'US', state_code: 'US-CA', zip: 'A'.repeat(21) },
      400,
    );
    expect(zip.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: {
        fields: expect.arrayContaining([expect.objectContaining({ field: 'zip' })]),
      },
    });
  });
});
