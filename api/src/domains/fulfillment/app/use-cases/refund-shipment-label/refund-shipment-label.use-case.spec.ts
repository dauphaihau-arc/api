import type { FinanceConfig } from '~/platform/config/finance.config';
import { OutboxEventStatus } from '~/platform/outbox/outbox-event.entity';
import { ShipmentLabelStatus } from '../../../domain/enums/shipment-label-status.enum';
import { RefundShipmentLabelUseCase } from './refund-shipment-label.use-case';

type BookingMode = FinanceConfig['moneyEventBooking'];

function buildUseCase(
  options: {
    moneyEventBooking?: BookingMode;
    transactionError?: Error;
  } = {},
) {
  const outboxEvent = {
    status: OutboxEventStatus.PENDING,
    processedAt: undefined as Date | undefined,
  };
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

      await command(context, { id: 'transaction-em', flush: jest.fn(async () => undefined) });

      return { status: 'unfulfilled' };
    }),
  };
  const fulfillmentService = {
    refundLabel: jest.fn(async () => ({
      refunded: true,
      label: { publicId: 'lbl_abc123', priceMinor: 980, currency: 'USD' },
    })),
  };
  const carrierParcelGateway = {
    refundLabel: jest.fn(async () => undefined),
  };
  const labelMoneyEventOutboxService = {
    createLabelRefundedEvent: jest.fn(async (
      _entityManager: unknown,
      _input: { occurredAt: Date },
    ) => outboxEvent),
  };
  const recordLabelMoneyEvent = {
    recordWithin: jest.fn(async () => ({ recorded: true })),
  };
  const storedLabel = {
    publicId: 'lbl_abc123',
    carrierLabelId: 'lbl_carrier',
    status: ShipmentLabelStatus.PURCHASED,
  };
  const entityManager = {
    fork: jest.fn(() => ({
      getRepository: jest.fn(() => ({
        findOne: jest.fn(async () => storedLabel),
      })),
    })),
  };
  const financeConfig: FinanceConfig = {
    moneyEventBooking: options.moneyEventBooking ?? 'outbox',
  };

  return {
    useCase: new RefundShipmentLabelUseCase(
      commandRunner as never,
      fulfillmentService as never,
      carrierParcelGateway as never,
      labelMoneyEventOutboxService as never,
      recordLabelMoneyEvent as never,
      entityManager as never,
      financeConfig,
    ),
    carrierParcelGateway,
    fulfillmentService,
    labelMoneyEventOutboxService,
    recordLabelMoneyEvent,
    outboxEvent,
  };
}

describe('RefundShipmentLabelUseCase money booking', () => {
  it('reverses the charge inside the producing transaction when booking is inline', async () => {
    const {
      useCase,
      labelMoneyEventOutboxService,
      recordLabelMoneyEvent,
      outboxEvent,
    } = buildUseCase({ moneyEventBooking: 'inline' });

    await useCase.execute('shop-1', 'order-1', 'shipment-1', 'user-1');

    expect(recordLabelMoneyEvent.recordWithin).toHaveBeenCalledTimes(1);
    expect(recordLabelMoneyEvent.recordWithin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'transaction-em' }),
      expect.objectContaining({
        labelId: 'lbl_abc123',
        shopId: 'shop-1',
        orderId: 'order-1',
        amountMinor: 980,
        currency: 'USD',
        occurredAt: expect.any(String),
      }),
      'refunded',
    );
    const outboxInput = labelMoneyEventOutboxService.createLabelRefundedEvent.mock.calls[0]![1];
    expect(outboxEvent.status).toBe(OutboxEventStatus.PROCESSED);
    expect(outboxEvent.processedAt).toEqual(outboxInput.occurredAt);
  });

  it('rolls the refund back when inline booking fails', async () => {
    const { useCase, recordLabelMoneyEvent } = buildUseCase({ moneyEventBooking: 'inline' });
    recordLabelMoneyEvent.recordWithin.mockRejectedValueOnce(new Error('ledger unavailable'));

    await expect(useCase.execute('shop-1', 'order-1', 'shipment-1', 'user-1'))
      .rejects.toThrow('ledger unavailable');
  });

  it('leaves the refund event pending for the finance worker when booking is outbox', async () => {
    const { useCase, recordLabelMoneyEvent, outboxEvent } = buildUseCase({
      moneyEventBooking: 'outbox',
    });

    await useCase.execute('shop-1', 'order-1', 'shipment-1', 'user-1');

    expect(recordLabelMoneyEvent.recordWithin).not.toHaveBeenCalled();
    expect(outboxEvent.status).toBe(OutboxEventStatus.PENDING);
    expect(outboxEvent.processedAt).toBeUndefined();
  });

  it('publishes no money event when the refund is already voided', async () => {
    const {
      useCase,
      fulfillmentService,
      labelMoneyEventOutboxService,
      recordLabelMoneyEvent,
    } = buildUseCase();
    fulfillmentService.refundLabel.mockResolvedValueOnce({
      refunded: false,
      label: undefined,
    } as never);

    await useCase.execute('shop-1', 'order-1', 'shipment-1', 'user-1');

    expect(labelMoneyEventOutboxService.createLabelRefundedEvent).not.toHaveBeenCalled();
    expect(recordLabelMoneyEvent.recordWithin).not.toHaveBeenCalled();
  });
});
