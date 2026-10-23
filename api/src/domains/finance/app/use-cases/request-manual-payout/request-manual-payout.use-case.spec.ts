import { ManualPayoutAlreadyUsedError } from '../../errors/finance-app.error';
import type { PayoutQueryRepository } from '../../ports/payout-query.repository';
import type { PayoutRecord } from '../../ports/payout.types';
import type { SettlementCurrencyRepository } from '../../ports/settlement-currency.repository';
import type { PayShopUseCase } from '../pay-shop/pay-shop.use-case';
import { RequestManualPayoutUseCase } from './request-manual-payout.use-case';

const NOW = new Date('2026-10-20T10:00:00.000Z');
const SHOP_ID = 'shop-1';
const USER_ID = 'user-1';

const PAID: PayoutRecord = {
  id: 'payout-1',
  publicId: 'pay_1',
  payoutNumber: 'PAY-20261020-000001',
  amountMinor: 12_500,
  currency: 'USD',
  state: 'paid',
  source: 'manual',
  periodKey: '2026-10',
  reason: null,
  providerReference: 'mb_transfer_1',
  paidAt: NOW,
  createdAt: NOW,
};

function setup(options: {
  unlimited: boolean;
  consumed: boolean;
  payout?: PayoutRecord | null;
}) {
  const payoutQueryRepository = {
    hasConsumedManualPayout: jest.fn().mockResolvedValue(options.consumed),
  } as unknown as PayoutQueryRepository;
  const settlementCurrencyRepository = {
    ensureCurrentCurrency: jest.fn().mockResolvedValue('USD'),
  } as unknown as SettlementCurrencyRepository;
  const payShopUseCase = {
    execute: jest.fn().mockResolvedValue({
      outcome: 'paid',
      payout: options.payout === undefined ? PAID : options.payout,
    }),
  } as unknown as PayShopUseCase;
  const clock = { now: () => NOW };

  return {
    useCase: new RequestManualPayoutUseCase(
      {
        autoPayoutDayOfMonth: 15,
        manualWithdrawalUnlimited: options.unlimited,
        autoPayoutForceDue: false,
        retryDelaysMs: [60_000, 300_000, 900_000],
      },
      payoutQueryRepository,
      settlementCurrencyRepository,
      payShopUseCase,
      clock,
    ),
    payoutQueryRepository,
    payShopUseCase,
  };
}

describe('RequestManualPayoutUseCase', () => {
  it('uses the whole net payable for the platform month when no amount is asked', async () => {
    const { useCase, payShopUseCase } = setup({
      unlimited: false,
      consumed: false,
    });

    await expect(
      useCase.execute({ shopId: SHOP_ID, requestedByUserId: USER_ID }),
    ).resolves.toBe(PAID);

    expect(payShopUseCase.execute).toHaveBeenCalledWith({
      shopId: SHOP_ID,
      currency: 'USD',
      runDay: '2026-10-20',
      source: 'manual',
      periodKey: '2026-10',
      requestedByUserId: USER_ID,
      amountMinor: undefined,
      quotaConsumed: true,
    });
  });

  it('refuses a second manual withdrawal in the same platform month before paying', async () => {
    const { useCase, payShopUseCase } = setup({
      unlimited: false,
      consumed: true,
    });

    await expect(
      useCase.execute({ shopId: SHOP_ID, requestedByUserId: USER_ID }),
    ).rejects.toBeInstanceOf(ManualPayoutAlreadyUsedError);
    expect(payShopUseCase.execute).not.toHaveBeenCalled();
  });

  it('does not consume the monthly allowance when the platform allows unlimited withdrawals', async () => {
    const { useCase, payShopUseCase, payoutQueryRepository } = setup({
      unlimited: true,
      consumed: true,
    });

    await useCase.execute({
      shopId: SHOP_ID,
      requestedByUserId: USER_ID,
      amountMinor: 5_000,
    });

    expect(payoutQueryRepository.hasConsumedManualPayout).not.toHaveBeenCalled();
    expect(payShopUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 5_000,
        quotaConsumed: false,
        periodKey: '2026-10',
      }),
    );
  });
});
