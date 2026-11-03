import { Buffer } from 'node:buffer';
import type { FinanceConfig } from '~/platform/config/finance.config';
import { OutboxEventStatus } from '~/platform/outbox/outbox-event.entity';
import { PurchaseFulfillmentLabelUseCase } from './purchase-fulfillment-label.use-case';

const purchasedLabel = {
  labelId: 'lbl_carrier',
  quoteId: 'rq_1',
  carrier: 'usps',
  service: 'standard',
  trackingNumber: '9400111899223197428490',
  priceMinor: 980,
  currency: 'USD',
  pdf: Buffer.from('%PDF-1.4\nlabel\n'),
};

type BookingMode = FinanceConfig['moneyEventBooking'];

function buildUseCase(
  options: {
    moneyEventBooking?: BookingMode;
    transactionError?: Error;
  } = {},
) {
  const outboxEvent = { status: OutboxEventStatus.PENDING, processedAt: undefined as Date | undefined };
  const commandRunner = {
    execute: jest.fn(async (
      _shopId: string,
      _orderId: string,
      command: (context: unknown, entityManager: unknown) => Promise<void>,
      runnerOptions: { beforeTransaction?: (context: unknown) => Promise<void> },
    ) => {
      const context = { id: 'order-1', shopId: 'shop-1' };
      await runnerOptions.beforeTransaction?.(context);

      if (options.transactionError) {
        throw options.transactionError;
      }

      const transactionEntityManager = { id: 'transaction-em', flush: jest.fn(async () => undefined) };
      await command(context, transactionEntityManager);

      return { status: 'prepared' };
    }),
  };
  const fulfillmentService = {
    assertPreparable: jest.fn(async () => undefined),
    prepareShipment: jest.fn(async () => ({ id: 'shipment-1' })),
    recordShipmentLabel: jest.fn(async () => undefined),
  };
  const carrierParcelGateway = {
    purchaseLabel: jest.fn(async () => purchasedLabel),
    refundLabel: jest.fn(async () => undefined),
  };
  const storageService = {
    putObject: jest.fn(async () => undefined),
    deleteObject: jest.fn(async () => undefined),
  };
  const entityManager = { fork: jest.fn(() => ({})) };
  const getSettlementCurrency = {
    execute: jest.fn(async () => ({ currency: 'USD' })),
  };
  const labelMoneyEventOutboxService = {
    createLabelChargedEvent: jest.fn(async (
      _entityManager: unknown,
      _input: { occurredAt: Date },
    ) => outboxEvent),
  };
  const recordLabelMoneyEvent = {
    recordWithin: jest.fn(async () => ({ recorded: true })),
  };
  const financeConfig: FinanceConfig = {
    moneyEventBooking: options.moneyEventBooking ?? 'outbox',
  };

  return {
    useCase: new PurchaseFulfillmentLabelUseCase(
      commandRunner as never,
      fulfillmentService as never,
      carrierParcelGateway as never,
      storageService as never,
      entityManager as never,
      getSettlementCurrency as never,
      labelMoneyEventOutboxService as never,
      recordLabelMoneyEvent as never,
      financeConfig,
    ),
    carrierParcelGateway,
    storageService,
    labelMoneyEventOutboxService,
    recordLabelMoneyEvent,
    outboxEvent,
  };
}

const command = {
  quoteId: 'rq_1',
  items: [{ orderItemId: 'item-1', quantity: 1 }],
};

describe('PurchaseFulfillmentLabelUseCase', () => {
  it('refunds the carrier label and drops the PDF when the local transaction fails', async () => {
    const { useCase, carrierParcelGateway, storageService } = buildUseCase({
      transactionError: new Error('database transaction failed'),
    });

    await expect(useCase.execute('shop-1', 'order-1', 'user-1', command))
      .rejects.toThrow('database transaction failed');

    expect(carrierParcelGateway.purchaseLabel).toHaveBeenCalledWith({
      quoteId: 'rq_1',
      currency: 'USD',
    });
    expect(carrierParcelGateway.refundLabel).toHaveBeenCalledWith({
      labelId: 'lbl_carrier',
    });
    expect(storageService.deleteObject).toHaveBeenCalledWith(
      expect.stringMatching(/^labels\/shop-1\/lbl_[0-9a-f]{12}\.pdf$/),
    );
  });

  it('books the label charge inside the producing transaction when booking is inline', async () => {
    const {
      useCase,
      labelMoneyEventOutboxService,
      recordLabelMoneyEvent,
      outboxEvent,
    } = buildUseCase({ moneyEventBooking: 'inline' });

    await useCase.execute('shop-1', 'order-1', 'user-1', command);

    expect(recordLabelMoneyEvent.recordWithin).toHaveBeenCalledTimes(1);
    expect(recordLabelMoneyEvent.recordWithin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'transaction-em' }),
      expect.objectContaining({
        shopId: 'shop-1',
        orderId: 'order-1',
        amountMinor: 980,
        currency: 'USD',
        labelId: expect.stringMatching(/^lbl_[0-9a-f]{12}$/),
        occurredAt: expect.any(String),
      }),
      'charged',
    );
    const outboxInput = labelMoneyEventOutboxService.createLabelChargedEvent.mock.calls[0]![1];
    expect(outboxEvent.status).toBe(OutboxEventStatus.PROCESSED);
    expect(outboxEvent.processedAt).toEqual(outboxInput.occurredAt);
  });

  it('rolls the purchase back when inline booking fails', async () => {
    const {
      useCase,
      recordLabelMoneyEvent,
      carrierParcelGateway,
      storageService,
    } = buildUseCase({ moneyEventBooking: 'inline' });
    recordLabelMoneyEvent.recordWithin.mockRejectedValueOnce(new Error('ledger unavailable'));

    await expect(useCase.execute('shop-1', 'order-1', 'user-1', command))
      .rejects.toThrow('ledger unavailable');

    expect(carrierParcelGateway.refundLabel).toHaveBeenCalledWith({
      labelId: 'lbl_carrier',
    });
    expect(storageService.deleteObject).toHaveBeenCalled();
  });

  it('leaves the outbox event pending for the finance worker when booking is outbox', async () => {
    const { useCase, recordLabelMoneyEvent, outboxEvent } = buildUseCase({
      moneyEventBooking: 'outbox',
    });

    await useCase.execute('shop-1', 'order-1', 'user-1', command);

    expect(recordLabelMoneyEvent.recordWithin).not.toHaveBeenCalled();
    expect(outboxEvent.status).toBe(OutboxEventStatus.PENDING);
    expect(outboxEvent.processedAt).toBeUndefined();
  });
});
