import type { EntityManager } from '@mikro-orm/postgresql';
import { GetAdminOrderFinancialBreakdownUseCase } from './get-admin-order-financial-breakdown.use-case';
import { OrderNotFoundError } from '../../errors/order-app.error';
import type { JournalEntryRepository } from '../../../../finance/app/ports/journal-entry.repository';

function createUseCase(options: {
  order: Record<string, unknown> | null;
  basis: { commissionMinor: number } | null;
}) {
  const findOne = jest.fn().mockResolvedValue(options.order);
  const entityManager = {
    fork: jest.fn(() => ({
      getRepository: jest.fn(() => ({ findOne })),
    })),
  } as unknown as EntityManager;
  const findOrderMoneyBasis = jest.fn().mockResolvedValue(options.basis);
  const journalEntryRepository = {
    findOrderMoneyBasis,
  } as unknown as JournalEntryRepository;

  return {
    useCase: new GetAdminOrderFinancialBreakdownUseCase(
      entityManager,
      journalEntryRepository,
    ),
    findOrderMoneyBasis,
    findOne,
  };
}

describe('GetAdminOrderFinancialBreakdownUseCase', () => {
  it('returns the recorded platform commission with the order currency and public id', async () => {
    const { useCase, findOrderMoneyBasis } = createUseCase({
      order: { id: 'order-1', publicId: 'ord_test1', currency: 'USD' },
      basis: { commissionMinor: 4750 },
    });

    await expect(useCase.execute('order-1')).resolves.toEqual({
      orderId: 'ord_test1',
      currency: 'USD',
      platformCommissionMinor: 4750,
    });
    expect(findOrderMoneyBasis).toHaveBeenCalledWith('order-1');
  });

  it('returns a null commission when the order has no journal basis', async () => {
    const { useCase } = createUseCase({
      order: { id: 'order-1', publicId: 'ord_test1', currency: 'EUR' },
      basis: null,
    });

    await expect(useCase.execute('order-1')).resolves.toEqual({
      orderId: 'ord_test1',
      currency: 'EUR',
      platformCommissionMinor: null,
    });
  });

  it('throws OrderNotFoundError when the order does not exist', async () => {
    const { useCase, findOrderMoneyBasis } = createUseCase({
      order: null,
      basis: null,
    });

    await expect(useCase.execute('missing-order')).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
    expect(findOrderMoneyBasis).not.toHaveBeenCalled();
  });
});
