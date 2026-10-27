import {
  BadRequestException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { FinanceMoneyEventProcessorService } from '~/domains/finance/app/services/finance-money-event-processor.service';
import type {
  PayoutRunSummary,
  RunPayoutsUseCase,
} from '~/domains/finance/app/use-cases/run-payouts/run-payouts.use-case';
import type { OrderCheckoutOutboxService } from '~/domains/order/app/services/order-checkout-outbox.service';
import type { OrderInventoryOutboxPublisherService } from '~/domains/order/app/services/order-inventory-outbox-publisher.service';
import type { OrderRefundService } from '~/domains/order/app/services/order-refund.service';
import { InternalOutboxJobsController } from './internal-outbox-jobs.controller';

const payoutSummary: PayoutRunSummary = {
  runDay: '2026-10-15',
  paidShopCount: 2,
  blockedShopCount: 1,
  skippedShopCount: 3,
};

interface StubOptions {
  secret?: string;
  financeError?: Error;
}

function buildController(options: StubOptions = {}) {
  const financeMoneyEventProcessorService = {
    processPendingEvents: options.financeError
      ? jest.fn().mockRejectedValue(options.financeError)
      : jest.fn().mockResolvedValue(3),
  } as unknown as jest.Mocked<FinanceMoneyEventProcessorService>;
  const orderCheckoutOutboxService = {
    processPendingEvents: jest.fn().mockResolvedValue(2),
  } as unknown as jest.Mocked<OrderCheckoutOutboxService>;
  const orderInventoryOutboxPublisherService = {
    processPendingEvents: jest.fn().mockResolvedValue(4),
  } as unknown as jest.Mocked<OrderInventoryOutboxPublisherService>;
  const orderRefundService = {
    reconcilePendingRefunds: jest.fn().mockResolvedValue(1),
  } as unknown as jest.Mocked<OrderRefundService>;
  const runPayoutsUseCase = {
    execute: jest.fn().mockResolvedValue(payoutSummary),
  } as unknown as jest.Mocked<RunPayoutsUseCase>;
  const configService = {
    get: jest.fn((key: string) =>
      key === 'OUTBOX_DRAIN_TRIGGER_SECRET' ? options.secret : undefined,
    ),
  } as unknown as jest.Mocked<ConfigService>;

  const controller = new InternalOutboxJobsController(
    financeMoneyEventProcessorService,
    orderCheckoutOutboxService,
    orderInventoryOutboxPublisherService,
    orderRefundService,
    runPayoutsUseCase,
    configService,
  );

  return {
    controller,
    financeMoneyEventProcessorService,
    orderCheckoutOutboxService,
    orderInventoryOutboxPublisherService,
    orderRefundService,
    runPayoutsUseCase,
  };
}

async function captureHttpError(
  promise: Promise<unknown>,
): Promise<{ status: number; body: unknown }> {
  try {
    await promise;
  }
  catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const exception = error as HttpException;

    return {
      status: exception.getStatus(),
      body: exception.getResponse(),
    };
  }

  throw new Error('Expected the drain call to reject');
}

describe('InternalOutboxJobsController', () => {
  it('returns 503 when the drain trigger secret is not configured', async () => {
    const {
      controller,
      financeMoneyEventProcessorService,
    } = buildController();

    const { status } = await captureHttpError(controller.drain('secret'));

    expect(status).toBe(503);
    expect(
      financeMoneyEventProcessorService.processPendingEvents,
    ).not.toHaveBeenCalled();
  });

  it('returns 401 when the cron secret is missing', async () => {
    const {
      controller,
      financeMoneyEventProcessorService,
    } = buildController({ secret: 'secret' });

    await expect(controller.drain()).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(
      financeMoneyEventProcessorService.processPendingEvents,
    ).not.toHaveBeenCalled();
  });

  it('returns 401 when the cron secret does not match', async () => {
    const {
      controller,
      financeMoneyEventProcessorService,
    } = buildController({ secret: 'secret' });

    await expect(controller.drain('wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(
      financeMoneyEventProcessorService.processPendingEvents,
    ).not.toHaveBeenCalled();
  });

  it('runs every poller by default and reports each count', async () => {
    const {
      controller,
      financeMoneyEventProcessorService,
      orderCheckoutOutboxService,
      orderInventoryOutboxPublisherService,
      orderRefundService,
      runPayoutsUseCase,
    } = buildController({ secret: 'secret' });

    await expect(controller.drain('secret')).resolves.toEqual({
      ok: true,
      finance: 3,
      checkout: 2,
      inventory: 4,
      refunds: 1,
      payoutRun: payoutSummary,
      failures: [],
      skipped: [],
    });
    expect(
      financeMoneyEventProcessorService.processPendingEvents,
    ).toHaveBeenCalledWith(10);
    expect(
      orderCheckoutOutboxService.processPendingEvents,
    ).toHaveBeenCalledWith(10);
    expect(
      orderInventoryOutboxPublisherService.processPendingEvents,
    ).toHaveBeenCalledWith(10);
    expect(orderRefundService.reconcilePendingRefunds).toHaveBeenCalledWith(10);
    expect(runPayoutsUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it('runs only the requested payout task', async () => {
    const {
      controller,
      financeMoneyEventProcessorService,
      orderCheckoutOutboxService,
      orderInventoryOutboxPublisherService,
      orderRefundService,
      runPayoutsUseCase,
    } = buildController({ secret: 'secret' });

    const response = await controller.drain('secret', undefined, 'payout');

    expect(response).toEqual({
      ok: true,
      finance: 0,
      checkout: 0,
      inventory: 0,
      refunds: 0,
      payoutRun: payoutSummary,
      failures: [],
      skipped: [],
    });
    expect(runPayoutsUseCase.execute).toHaveBeenCalledTimes(1);
    expect(
      financeMoneyEventProcessorService.processPendingEvents,
    ).not.toHaveBeenCalled();
    expect(
      orderCheckoutOutboxService.processPendingEvents,
    ).not.toHaveBeenCalled();
    expect(
      orderInventoryOutboxPublisherService.processPendingEvents,
    ).not.toHaveBeenCalled();
    expect(orderRefundService.reconcilePendingRefunds).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown task name', async () => {
    const {
      controller,
      financeMoneyEventProcessorService,
      runPayoutsUseCase,
    } = buildController({ secret: 'secret' });

    await expect(
      controller.drain('secret', undefined, 'refunds,bogus'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      financeMoneyEventProcessorService.processPendingEvents,
    ).not.toHaveBeenCalled();
    expect(runPayoutsUseCase.execute).not.toHaveBeenCalled();
  });

  it('passes an explicit limit to every task', async () => {
    const {
      controller,
      financeMoneyEventProcessorService,
      orderRefundService,
    } = buildController({ secret: 'secret' });

    await controller.drain('secret', '5', 'finance,refunds');

    expect(
      financeMoneyEventProcessorService.processPendingEvents,
    ).toHaveBeenCalledWith(5);
    expect(orderRefundService.reconcilePendingRefunds).toHaveBeenCalledWith(5);
  });

  it('clamps a limit above the maximum to 50', async () => {
    const {
      controller,
      financeMoneyEventProcessorService,
    } = buildController({ secret: 'secret' });

    await controller.drain('secret', '999', 'finance');

    expect(
      financeMoneyEventProcessorService.processPendingEvents,
    ).toHaveBeenCalledWith(50);
  });

  it.each(['0', 'abc'])(
    'returns 400 for an invalid limit of %s',
    async (limit) => {
      const {
        controller,
        financeMoneyEventProcessorService,
      } = buildController({ secret: 'secret' });

      await expect(
        controller.drain('secret', limit),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(
        financeMoneyEventProcessorService.processPendingEvents,
      ).not.toHaveBeenCalled();
    },
  );

  it('isolates a failing task and reports the failure with HTTP 500', async () => {
    const {
      controller,
      orderCheckoutOutboxService,
      orderInventoryOutboxPublisherService,
      orderRefundService,
      runPayoutsUseCase,
    } = buildController({
      secret: 'secret',
      financeError: new Error('finance boom'),
    });

    const { status, body } = await captureHttpError(
      controller.drain('secret'),
    );

    expect(status).toBe(500);
    expect(body).toEqual({
      ok: false,
      finance: 0,
      checkout: 2,
      inventory: 4,
      refunds: 1,
      payoutRun: payoutSummary,
      failures: [{ task: 'finance', message: 'finance boom' }],
      skipped: [],
    });
    expect(
      orderCheckoutOutboxService.processPendingEvents,
    ).toHaveBeenCalledTimes(1);
    expect(
      orderInventoryOutboxPublisherService.processPendingEvents,
    ).toHaveBeenCalledTimes(1);
    expect(orderRefundService.reconcilePendingRefunds).toHaveBeenCalledTimes(1);
    expect(runPayoutsUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it('does not special-case repeated calls', async () => {
    const {
      controller,
      financeMoneyEventProcessorService,
      runPayoutsUseCase,
    } = buildController({ secret: 'secret' });

    await controller.drain('secret');

    const response = await controller.drain('secret');

    expect(response).toEqual({
      ok: true,
      finance: 3,
      checkout: 2,
      inventory: 4,
      refunds: 1,
      payoutRun: payoutSummary,
      failures: [],
      skipped: [],
    });
    expect(
      financeMoneyEventProcessorService.processPendingEvents,
    ).toHaveBeenCalledTimes(2);
    expect(runPayoutsUseCase.execute).toHaveBeenCalledTimes(2);
  });
});
