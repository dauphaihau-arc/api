import type { PayoutConfig } from '~/platform/config/payout.config';
import type { Clock } from '~/platform/time/clock';
import type { PayoutQueryRepository } from '../../ports/payout-query.repository';
import type { PayShopUseCase } from '../pay-shop/pay-shop.use-case';
import { RunPayoutsUseCase } from './run-payouts.use-case';

function buildConfig(overrides: Partial<PayoutConfig> = {}): PayoutConfig {
  return {
    autoPayoutDayOfMonth: 15,
    manualWithdrawalUnlimited: false,
    autoPayoutForceDue: false,
    retryDelaysMs: [60_000, 300_000, 900_000],
    platformCurrency: 'USD',
    ...overrides,
  };
}

function buildRun(now: Date, config: PayoutConfig) {
  const queryRepository = {
    findAutoPayoutShops: jest.fn().mockResolvedValue([
      { shopId: 'shop-1', currency: 'USD' },
    ]),
  } as unknown as PayoutQueryRepository;
  const payShopUseCase = {
    execute: jest.fn().mockResolvedValue({ outcome: 'paid', payout: null }),
  } as unknown as PayShopUseCase;
  const clock = {
    now: () => now,
  } as Clock;

  return {
    run: new RunPayoutsUseCase(
      config,
      queryRepository,
      payShopUseCase,
      clock,
    ),
    queryRepository,
    payShopUseCase,
  };
}

describe('RunPayoutsUseCase', () => {
  it('does nothing on a day other than the configured auto day', async () => {
    const { run, queryRepository, payShopUseCase } = buildRun(
      new Date('2026-10-20T12:00:00.000Z'),
      buildConfig(),
    );

    const summary = await run.execute();

    expect(summary.paidShopCount).toBe(0);
    expect(queryRepository.findAutoPayoutShops).not.toHaveBeenCalled();
    expect(payShopUseCase.execute).not.toHaveBeenCalled();
  });

  it('treats today as due when the local/E2E force flag is on', async () => {
    const now = new Date('2026-10-20T12:00:00.000Z');
    const { run, queryRepository, payShopUseCase } = buildRun(
      now,
      buildConfig({ autoPayoutForceDue: true }),
    );

    const summary = await run.execute();

    expect(summary.paidShopCount).toBe(1);
    expect(queryRepository.findAutoPayoutShops).toHaveBeenCalledWith(now);
    expect(payShopUseCase.execute).toHaveBeenCalledWith({
      shopId: 'shop-1',
      currency: 'USD',
      runDay: '2026-10-20',
      source: 'scheduled',
      periodKey: '2026-10',
      quotaConsumed: true,
    });
  });

  it('still keeps the real day-start cutoff when not forced', async () => {
    const { run, queryRepository } = buildRun(
      new Date('2026-10-15T12:00:00.000Z'),
      buildConfig(),
    );

    await run.execute();

    expect(queryRepository.findAutoPayoutShops).toHaveBeenCalledWith(
      new Date('2026-10-15T00:00:00.000Z'),
    );
  });
});
