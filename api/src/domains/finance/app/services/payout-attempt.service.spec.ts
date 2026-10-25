import type { EntityManager } from '@mikro-orm/postgresql';
import type { PayoutConfig } from '~/platform/config/payout.config';
import type { Clock } from '~/platform/time/clock';
import {
  PayoutGateway,
  PayoutTransferPermanentError,
  type PayoutProviderBalance,
  type PayoutTransferInput,
  type PayoutTransferResult,
} from '~/integrations/payment/app/ports/payout-gateway';
import type { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import type { JournalEntryRepository } from '../ports/journal-entry.repository';
import type { PayoutCommandRepository } from '../ports/payout-command.repository';
import type { SellerPayableCommandRepository } from '../ports/seller-payable-command.repository';
import type { PayoutNotificationService } from './payout-notification.service';
import {
  PayoutAttemptService,
  type PayoutAttemptInput,
} from './payout-attempt.service';

const NOW = new Date('2026-10-20T10:00:00.000Z');

class FailingGateway extends PayoutGateway {
  readonly calls: PayoutTransferInput[] = [];
  error: unknown = new Error('provider timeout');

  async send(input: PayoutTransferInput): Promise<PayoutTransferResult> {
    this.calls.push(input);

    throw this.error;
  }

  async retrieveBalance(currency: string): Promise<PayoutProviderBalance> {
    return { currency, availableMinor: 0, pendingMinor: 0 };
  }
}

class SucceedingGateway extends PayoutGateway {
  readonly calls: PayoutTransferInput[] = [];

  async send(input: PayoutTransferInput): Promise<PayoutTransferResult> {
    this.calls.push(input);

    return { reference: 'tr_1', providerFxRate: null, targetAmountMinor: null };
  }

  async retrieveBalance(currency: string): Promise<PayoutProviderBalance> {
    return { currency, availableMinor: 0, pendingMinor: 0 };
  }
}

function attemptInput(
  overrides: Partial<PayoutAttemptInput['payout']> = {},
): PayoutAttemptInput {
  return {
    payout: {
      id: 'payout-1',
      publicId: 'pay_1',
      shopId: 'shop-1',
      currency: 'CAD',
      amountMinor: 10_000,
      source: 'manual',
      targetCurrency: 'CAD',
      transferCurrency: 'USD',
      transferAmountMinor: 7_300,
      fxRate: '0.73',
      targetAmountMinor: null,
      ...overrides,
    },
    target: {
      id: 'account-1',
      shopId: 'shop-1',
      provider: 'manual_bank',
      providerAccountId: null,
      country: 'US',
      currency: 'CAD',
    },
    allocations: [{ orderId: 'order-1', amountMinor: 10_000 }],
  };
}

function setup(gateway: PayoutGateway = new FailingGateway()) {
  const payoutCommandRepository = {
    settle: jest.fn().mockResolvedValue(true),
    recordAttemptFailure: jest.fn().mockResolvedValue(1),
    markFailed: jest.fn().mockResolvedValue(true),
    releaseQuota: jest.fn().mockResolvedValue(true),
  } as unknown as PayoutCommandRepository;
  const notification = { notifyOutcome: jest.fn().mockResolvedValue(undefined) };
  const jobDispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) } as unknown as JobDispatcher;
  const journalEntryRepository = {
    append: jest.fn().mockResolvedValue(undefined),
  } as unknown as JournalEntryRepository;
  const sellerPayableRepository = {
    dischargeAvailable: jest.fn().mockResolvedValue(undefined),
  } as unknown as SellerPayableCommandRepository;
  const entityManager = {
    transactional: async <T>(work: (em: unknown) => Promise<T>): Promise<T> =>
      work({ flush: async () => undefined }),
  } as unknown as EntityManager;
  const config = {
    retryDelaysMs: [60_000, 300_000, 900_000],
  } as unknown as PayoutConfig;

  const service = new PayoutAttemptService(
    entityManager,
    config,
    payoutCommandRepository,
    sellerPayableRepository,
    journalEntryRepository,
    gateway,
    notification as unknown as PayoutNotificationService,
    jobDispatcher,
    { now: () => NOW } as Clock,
  );

  return {
    service,
    payoutCommandRepository,
    notification,
    jobDispatcher,
  };
}

describe('PayoutAttemptService provider outcomes', () => {
  it('marks the Payout failed at once on a permanent provider error, with no retry', async () => {
    const gateway = new FailingGateway();
    gateway.error = new PayoutTransferPermanentError(
      'Your balance is insufficient to cover the requested transfer.',
      'balance_insufficient',
    );
    const {
      service, payoutCommandRepository, notification, jobDispatcher, 
    } =
      setup(gateway);

    const outcome = await service.attempt(attemptInput());

    expect(outcome).toBe('failed');
    expect(payoutCommandRepository.markFailed).toHaveBeenCalledWith({
      payoutId: 'payout-1',
      reason: 'Your balance is insufficient to cover the requested transfer.',
    });
    // One failure notification, no retry job: a 4xx is not fixed in minutes.
    expect(jobDispatcher.dispatch).not.toHaveBeenCalled();
    expect(notification.notifyOutcome).toHaveBeenCalledTimes(1);
    expect(notification.notifyOutcome).toHaveBeenCalledWith('payout-1', 'failed');
    expect(payoutCommandRepository.releaseQuota).toHaveBeenCalledWith('payout-1', {});
  });

  it('still schedules a retry for a transient provider failure', async () => {
    const {
      service, payoutCommandRepository, notification, jobDispatcher, 
    } =
      setup();

    const outcome = await service.attempt(attemptInput());

    expect(outcome).toBe('retrying');
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'payout.retry',
      { payoutId: 'payout-1' },
      { delayMs: 60_000 },
    );
    expect(payoutCommandRepository.markFailed).not.toHaveBeenCalled();
    expect(notification.notifyOutcome).not.toHaveBeenCalled();
  });

  it('fails a transient attempt once the retry schedule is exhausted', async () => {
    const {
      service, payoutCommandRepository, notification, jobDispatcher, 
    } =
      setup();
    (payoutCommandRepository.recordAttemptFailure as jest.Mock).mockResolvedValue(5);

    const outcome = await service.attempt(attemptInput());

    expect(outcome).toBe('failed');
    expect(jobDispatcher.dispatch).not.toHaveBeenCalled();
    expect(notification.notifyOutcome).toHaveBeenCalledWith('payout-1', 'failed');
  });

  it('transfers the frozen platform-currency amount, not the shop-currency one', async () => {
    const gateway = new SucceedingGateway();
    const { service } = setup(gateway);

    await expect(service.attempt(attemptInput())).resolves.toBe('paid');

    expect(gateway.calls[0]).toMatchObject({
      amountMinor: 10_000,
      currency: 'CAD',
      transferCurrency: 'USD',
      transferAmountMinor: 7_300,
      fxRate: '0.73',
      targetCurrency: 'CAD',
    });
  });

  it('falls back to the shop-currency amount on a row claimed before the transfer fields', async () => {
    const gateway = new SucceedingGateway();
    const { service } = setup(gateway);

    await service.attempt(
      attemptInput({
        transferCurrency: null,
        transferAmountMinor: null,
        fxRate: null,
      }),
    );

    expect(gateway.calls[0]).toMatchObject({
      amountMinor: 10_000,
      transferCurrency: 'CAD',
      transferAmountMinor: 10_000,
      fxRate: '1',
    });
  });

  it('reuses the stored transfer fields when a retry runs', async () => {
    const gateway = new SucceedingGateway();
    const { service } = setup(gateway);

    // A retry is the same attempt with the row it was claimed with; only the
    // attempt count differs, so the transfer numbers must not be recomputed.
    await service.attempt(attemptInput());
    await service.attempt(attemptInput());

    expect(gateway.calls.map((call) => ({
      transferCurrency: call.transferCurrency,
      transferAmountMinor: call.transferAmountMinor,
      fxRate: call.fxRate,
    }))).toEqual([
      { transferCurrency: 'USD', transferAmountMinor: 7_300, fxRate: '0.73' },
      { transferCurrency: 'USD', transferAmountMinor: 7_300, fxRate: '0.73' },
    ]);
  });
});
