import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  RANDOM_SEED_COUNTRY,
  loadPayoutAccountSeeds,
  resolveSeedCountry,
} from '../../../../../database/seeds/payout-account.seed';

const TSV_HEADER = 'shop_slug\tcountry\tstatus\n';

describe('payout account seed countries', () => {
  let directory: string;
  let shared: string;
  let local: string;
  let logged: string[];
  let originalEnv: NodeJS.ProcessEnv;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.PAYOUT_CONNECT_COUNTRIES;
    process.env.PAYOUT_PLATFORM_COUNTRY = 'US';

    directory = mkdtempSync(path.join(tmpdir(), 'payout-account-seed-'));
    shared = path.join(directory, 'payout-accounts.tsv');
    local = path.join(directory, 'payout-accounts.local.tsv');
    writeFileSync(shared, TSV_HEADER);
    writeFileSync(local, TSV_HEADER);

    logged = [];
    logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation((message: string) => {
        logged.push(message);
      });
  });

  afterEach(() => {
    logSpy.mockRestore();
    rmSync(directory, { force: true, recursive: true });
    process.env = originalEnv;
  });

  it('skips a TSV row whose country Stripe cannot pay out to, and logs it', () => {
    writeFileSync(
      shared,
      `${TSV_HEADER}olive-atelier\tUS\tactive\nsydney-store\tAU\tactive\n`,
    );

    const seeds = loadPayoutAccountSeeds({ shared, local });

    expect(seeds.map(seed => seed.shopSlug)).toEqual(['olive-atelier']);
    expect(seeds[0]?.country).toBe('US');
    expect(logged.join('\n')).toMatch(/sydney-store \(AU\)/);
  });

  it('keeps an explicit supported country and normalizes it', () => {
    writeFileSync(
      shared,
      `${TSV_HEADER}reed-workshop\tde\tactive\nhazel-home\tCA\tactive\n`,
    );

    const seeds = loadPayoutAccountSeeds({ shared, local });

    expect(seeds.map(seed => seed.country)).toEqual(['DE', 'CA']);
  });

  it('keeps the random sentinel for the seed run to resolve', () => {
    writeFileSync(
      local,
      `${TSV_HEADER}juno-console\tRANDOM\tactive\n`,
    );

    const seeds = loadPayoutAccountSeeds({ shared, local });

    expect(seeds).toEqual([
      { shopSlug: 'juno-console', country: RANDOM_SEED_COUNTRY, status: 'active' },
    ]);
  });
});

describe('resolveSeedCountry', () => {
  it('honours an explicit country', () => {
    expect(resolveSeedCountry('DE', ['US', 'GB'])).toBe('DE');
  });

  it('picks a supported country for a random row', () => {
    const supported = ['US', 'GB', 'CA', 'CH'];

    expect(resolveSeedCountry(RANDOM_SEED_COUNTRY, supported, () => 0)).toBe('US');
    expect(resolveSeedCountry(RANDOM_SEED_COUNTRY, supported, () => 0.5)).toBe('CA');
    expect(resolveSeedCountry(RANDOM_SEED_COUNTRY, supported, () => 0.999)).toBe('CH');
  });
});
