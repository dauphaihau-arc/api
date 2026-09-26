import { FxRateService, type FxRateCache } from './fx-rate.service';

const storedRow = {
  fromCurrency: 'USD',
  toCurrency: 'VND',
  rate: '25000.5',
  effectiveAt: new Date('2026-09-26T00:00:00.000Z'),
  source: 'open-exchange-rates',
  sourceTimestamp: new Date('2026-09-25T00:00:00.000Z'),
  expiresAt: null,
};

function buildService(rows: Array<typeof storedRow> = []) {
  const findOne = jest.fn(async (): Promise<typeof storedRow | null> => rows.shift() ?? null);
  const service = new FxRateService({
    fork: () => ({ getRepository: () => ({ findOne }) }),
  } as never);

  return { service, findOne };
}

describe('FxRateService.getLatestRate', () => {
  it('returns the identity rate without touching the database', async () => {
    const { service, findOne } = buildService();

    await expect(
      service.getLatestRate({ fromCurrency: 'JPY', toCurrency: 'JPY' }),
    ).resolves.toMatchObject({ rate: '1', source: 'identity' });
    expect(findOne).not.toHaveBeenCalled();
  });

  it('maps the stored row onto a snapshot', async () => {
    const { service } = buildService([storedRow]);

    await expect(
      service.getLatestRate({ fromCurrency: 'USD', toCurrency: 'VND' }),
    ).resolves.toEqual({
      fromCurrency: 'USD',
      toCurrency: 'VND',
      rate: '25000.5',
      effectiveAt: storedRow.effectiveAt,
      source: 'open-exchange-rates',
      sourceTimestamp: storedRow.sourceTimestamp,
    });
  });

  it('caches a miss so a repeated lookup does not query again', async () => {
    const { service, findOne } = buildService();
    const cache: FxRateCache = new Map();

    const first = await service.getLatestRate({ fromCurrency: 'USD', toCurrency: 'VND' }, cache);
    const second = await service.getLatestRate({ fromCurrency: 'USD', toCurrency: 'VND' }, cache);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('keys the cache by point in time', async () => {
    const { service, findOne } = buildService([storedRow, storedRow]);
    const cache: FxRateCache = new Map();

    await service.getLatestRate({
      fromCurrency: 'USD',
      toCurrency: 'VND',
      at: new Date('2026-09-26T00:00:00.000Z'),
    }, cache);
    await service.getLatestRate({
      fromCurrency: 'USD',
      toCurrency: 'VND',
      at: new Date('2026-09-27T00:00:00.000Z'),
    }, cache);

    expect(findOne).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight lookup between concurrent callers', async () => {
    const { service, findOne } = buildService([storedRow]);
    const cache: FxRateCache = new Map();

    const [first, second] = await Promise.all([
      service.getLatestRate({ fromCurrency: 'USD', toCurrency: 'VND' }, cache),
      service.getLatestRate({ fromCurrency: 'USD', toCurrency: 'VND' }, cache),
    ]);

    expect(findOne).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });
});
