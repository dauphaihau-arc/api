import type { EntityManager } from '@mikro-orm/postgresql';
import { GetAdminOrderFinancialBreakdownUseCase } from './get-admin-order-financial-breakdown.use-case';
import { OrderNotFoundError } from '../../errors/order-app.error';
import type { JournalEntryRepository } from '../../../../finance/app/ports/journal-entry.repository';
import type {
  OrderPayoutFacts,
  OrderPayoutQueryRepository,
} from '../../../../finance/app/ports/order-payout-query.repository';
import type {
  OrderPayoutMethod,
  OrderPayoutMethodService,
} from '../../../../finance/app/services/order-payout-method.service';

const AVAILABLE_AT = new Date('2026-11-02T10:00:00.000Z');
const PAID_AT = new Date('2026-11-03T09:00:00.000Z');

const PAYOUT_METHOD: OrderPayoutMethod = {
  accountStatus: 'active',
  autoPayoutEnabled: true,
  autoPayoutDayOfMonth: 15,
  nextPayoutDate: '2026-11-15',
};

function createUseCase(options: {
  order: Record<string, unknown> | null;
  basis: { commissionMinor: number } | null;
  sellerPayable?: { shopId: string; currency: string; amountMinor: number } | null;
  payoutFacts?: OrderPayoutFacts | null;
}) {
  const findOne = jest.fn().mockResolvedValue(options.order);
  const entityManager = {
    fork: jest.fn(() => ({
      getRepository: jest.fn(() => ({ findOne })),
    })),
  } as unknown as EntityManager;
  const findOrderMoneyBasis = jest.fn().mockResolvedValue(options.basis);
  const findOrderSellerPayable = jest
    .fn()
    .mockResolvedValue(options.sellerPayable ?? null);
  const journalEntryRepository = {
    findOrderMoneyBasis,
    findOrderSellerPayable,
  } as unknown as JournalEntryRepository;
  const findOrderPayoutFacts = jest
    .fn()
    .mockResolvedValue(options.payoutFacts ?? null);
  const orderPayoutQueryRepository = {
    findOrderPayoutFacts,
  } as unknown as OrderPayoutQueryRepository;
  const resolve = jest.fn().mockResolvedValue(PAYOUT_METHOD);
  const orderPayoutMethodService = { resolve } as unknown as OrderPayoutMethodService;

  return {
    useCase: new GetAdminOrderFinancialBreakdownUseCase(
      entityManager,
      journalEntryRepository,
      orderPayoutQueryRepository,
      orderPayoutMethodService,
    ),
    findOrderMoneyBasis,
    findOrderPayoutFacts,
    resolve,
  };
}

describe('GetAdminOrderFinancialBreakdownUseCase', () => {
  it('returns the recorded commission with the order currency and public id', async () => {
    const {
      useCase,
      findOrderMoneyBasis,
      findOrderPayoutFacts,
      resolve,
    } = createUseCase({
      order: {
        id: 'order-1',
        publicId: 'ord_test1',
        currency: 'USD',
        shop: { id: 'shop-1' },
      },
      basis: { commissionMinor: 4750 },
    });

    await expect(useCase.execute('order-1')).resolves.toEqual({
      orderId: 'ord_test1',
      currency: 'USD',
      platformCommissionMinor: 4750,
      sellerPayableMinor: null,
      availability: { recorded: false, availableAt: null },
      payout: null,
      payoutMethod: PAYOUT_METHOD,
    });
    expect(findOrderMoneyBasis).toHaveBeenCalledWith('order-1');
    expect(findOrderPayoutFacts).toHaveBeenCalledWith('order-1');
    expect(resolve).toHaveBeenCalledWith('shop-1');
  });

  it('returns a null commission when the order has no journal basis', async () => {
    const { useCase } = createUseCase({
      order: {
        id: 'order-1',
        publicId: 'ord_test1',
        currency: 'EUR',
        shop: { id: 'shop-1' },
      },
      basis: null,
    });

    await expect(useCase.execute('order-1')).resolves.toEqual({
      orderId: 'ord_test1',
      currency: 'EUR',
      platformCommissionMinor: null,
      sellerPayableMinor: null,
      availability: { recorded: false, availableAt: null },
      payout: null,
      payoutMethod: PAYOUT_METHOD,
    });
  });

  it('adds the Finance payout facts for the order', async () => {
    const { useCase } = createUseCase({
      order: {
        id: 'order-1',
        publicId: 'ord_test1',
        currency: 'USD',
        shop: { id: 'shop-1' },
      },
      basis: { commissionMinor: 4750 },
      sellerPayable: { shopId: 'shop-1', currency: 'USD', amountMinor: 2_500 },
      payoutFacts: {
        orderPublicId: 'ord_test1',
        shopId: 'shop-1',
        currency: 'USD',
        availability: {
          recorded: true,
          availableAt: AVAILABLE_AT,
          amountMinor: 2_500,
        },
        payout: {
          id: 'pay_1',
          state: 'paid',
          amountMinor: 2_500,
          paidAt: PAID_AT,
        },
      },
    });

    await expect(useCase.execute('order-1')).resolves.toEqual({
      orderId: 'ord_test1',
      currency: 'USD',
      platformCommissionMinor: 4750,
      sellerPayableMinor: 2_500,
      availability: { recorded: true, availableAt: AVAILABLE_AT },
      payout: {
        id: 'pay_1',
        state: 'paid',
        amountMinor: 2_500,
        paidAt: PAID_AT,
      },
      payoutMethod: PAYOUT_METHOD,
    });
  });

  it('throws OrderNotFoundError when the order does not exist', async () => {
    const { useCase, findOrderMoneyBasis, findOrderPayoutFacts } = createUseCase({
      order: null,
      basis: null,
    });

    await expect(useCase.execute('missing-order')).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
    expect(findOrderMoneyBasis).not.toHaveBeenCalled();
    expect(findOrderPayoutFacts).not.toHaveBeenCalled();
  });
});
