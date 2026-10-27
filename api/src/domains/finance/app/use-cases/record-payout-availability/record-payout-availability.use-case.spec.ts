import type { EntityManager } from '@mikro-orm/postgresql';
import { PaidOrderPostingNotRecordedError } from '../../errors/finance-app.error';
import type { OrderDeliveredEvent } from '../../ports/order-delivered-event';
import type { JournalEntryRepository } from '../../ports/journal-entry.repository';
import type { OrderPaidEventRepository } from '../../ports/order-paid-event.repository';
import type { PayoutAvailabilityRepository } from '../../ports/payout-availability.repository';
import type { SellerPayableCommandRepository } from '../../ports/seller-payable-command.repository';
import { RecordPayoutAvailabilityUseCase } from './record-payout-availability.use-case';

const EVENT: OrderDeliveredEvent = {
  orderId: 'order-1',
  deliveredAt: '2026-10-01T08:00:00.000Z',
  occurredAt: '2026-10-01T09:00:00.000Z',
  evidence: [{
    shipmentId: 'shipment-1',
    shipmentPublicId: 'shp_1',
    deliveredAt: '2026-10-01T08:00:00.000Z',
  }],
};

describe('RecordPayoutAvailabilityUseCase', () => {
  it('joins the caller transaction and threads its EntityManager into every repository call', async () => {
    const {
      useCase, entityManager, journalEntryRepository, payoutAvailabilityRepository, sellerPayableRepository, 
    } =
      buildUseCase();

    const result = await useCase.recordWithin(entityManager, EVENT);

    expect(result).toEqual({ recorded: true });
    expect(entityManager.execute).toHaveBeenCalledWith(
      'select pg_advisory_xact_lock(hashtext(?))',
      ['finance.seller-payable.order:order-1'],
    );
    expect(journalEntryRepository.findOrderSellerPayable).toHaveBeenCalledWith(
      'order-1',
      { entityManager },
    );
    expect(payoutAvailabilityRepository.record).toHaveBeenCalledWith(
      {
        orderId: 'order-1',
        shopId: 'shop-1',
        currency: 'USD',
        amountMinor: 2500,
        deliveredAt: new Date('2026-10-01T08:00:00.000Z'),
        evidence: [{
          shipmentId: 'shipment-1',
          shipmentPublicId: 'shp_1',
          deliveredAt: new Date('2026-10-01T08:00:00.000Z'),
        }],
      },
      { entityManager },
    );
    expect(sellerPayableRepository.releaseToAvailable).toHaveBeenCalledWith(
      'shop-1',
      'USD',
      2500,
      { entityManager },
    );
    expect(entityManager.flush).toHaveBeenCalledTimes(1);
  });

  it('releases nothing when the availability was already recorded', async () => {
    const {
      useCase, entityManager, payoutAvailabilityRepository, sellerPayableRepository, 
    } =
      buildUseCase();
    payoutAvailabilityRepository.record.mockResolvedValue(false);

    const result = await useCase.recordWithin(entityManager, EVENT);

    expect(result).toEqual({ recorded: false });
    expect(sellerPayableRepository.releaseToAvailable).not.toHaveBeenCalled();
  });

  it('stays retryable while the paid posting is still on its way', async () => {
    const {
      useCase, entityManager, journalEntryRepository, orderPaidEventRepository, 
    } =
      buildUseCase();
    journalEntryRepository.findOrderSellerPayable.mockResolvedValue(null);
    orderPaidEventRepository.findStatusByOrderId.mockResolvedValue('pending');

    await expect(useCase.recordWithin(entityManager, EVENT)).rejects.toBeInstanceOf(
      PaidOrderPostingNotRecordedError,
    );
  });

  it('opens its own transaction only when executed', async () => {
    const {
      useCase,
      transactionEntityManager,
      journalEntryRepository,
    } = buildUseCase();

    const result = await useCase.execute(EVENT);

    expect(result).toEqual({ recorded: true });
    expect(journalEntryRepository.findOrderSellerPayable).toHaveBeenCalledWith(
      'order-1',
      { entityManager: transactionEntityManager },
    );
  });
});

function buildUseCase() {
  const transactionEntityManager = {
    execute: jest.fn().mockResolvedValue([]),
    flush: jest.fn().mockResolvedValue(undefined),
  } as unknown as EntityManager;
  const entityManager = {
    transactional: jest.fn(
      async (callback: (em: EntityManager) => Promise<unknown>) =>
        callback(transactionEntityManager),
    ),
  } as unknown as EntityManager & { transactional: jest.Mock };
  const journalEntryRepository = {
    findOrderSellerPayable: jest.fn().mockResolvedValue({
      shopId: 'shop-1',
      currency: 'USD',
      amountMinor: 2500,
    }),
  } as unknown as jest.Mocked<JournalEntryRepository>;
  const payoutAvailabilityRepository = {
    record: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<PayoutAvailabilityRepository>;
  const sellerPayableRepository = {
    releaseToAvailable: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<SellerPayableCommandRepository>;
  const orderPaidEventRepository = {
    findStatusByOrderId: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<OrderPaidEventRepository>;

  const useCase = new RecordPayoutAvailabilityUseCase(
    entityManager,
    journalEntryRepository,
    payoutAvailabilityRepository,
    sellerPayableRepository,
    orderPaidEventRepository,
  );

  return {
    useCase,
    entityManager: transactionEntityManager,
    transactionEntityManager,
    journalEntryRepository,
    payoutAvailabilityRepository,
    sellerPayableRepository,
    orderPaidEventRepository,
  };
}
