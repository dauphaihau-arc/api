import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import { LedgerAccountKind } from '../../../domain/enums/ledger-account-kind.enum';
import { PROVIDER_FEE_MONEY_EVENT_KIND } from '../../../domain/rules/provider-fee';
import type { JournalEntryRepository } from '../../ports/journal-entry.repository';
import type {
  InsertProviderFeeInput,
  ProviderFeeRecord,
  ProviderFeeRepository,
} from '../../ports/provider-fee.repository';
import { RecordProviderFeeUseCase } from './record-provider-fee.use-case';

const NOW = new Date('2026-10-23T10:00:00.000Z');
const OCCURRED_AT = new Date('2026-10-23T09:15:00.000Z');

function buildFee(overrides: Partial<ProviderFeeRecord> = {}): ProviderFeeRecord {
  return {
    id: 'fee-1',
    provider: 'stripe',
    providerReference: 'txn_123',
    currency: 'USD',
    amountMinor: 189,
    occurredAt: OCCURRED_AT,
    recordedAt: NOW,
    journalEntryId: 'je-1',
    journalEntryKey: 'provider.fee:fee-1',
    ...overrides,
  };
}

function setup(options: { existing?: ProviderFeeRecord | null } = {}) {
  const entityManager = {
    transactional: jest.fn(async (callback: (em: unknown) => unknown) =>
      callback({ fork: 'tx' })),
  } as unknown as EntityManager;

  const journalEntryRepository = {
    append: jest.fn().mockResolvedValue(true),
    findIdByMoneyEventKey: jest.fn().mockResolvedValue('je-1'),
  } as unknown as JournalEntryRepository;

  const providerFeeRepository = {
    lockProviderReference: jest.fn().mockResolvedValue(undefined),
    findByProviderReference: jest.fn().mockResolvedValue(options.existing ?? null),
    insert: jest.fn(async (input: InsertProviderFeeInput) =>
      buildFee({ ...input, journalEntryKey: `provider.fee:${input.id}` })),
  } as unknown as ProviderFeeRepository;

  const auditLogService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogService;

  const useCase = new RecordProviderFeeUseCase(
    entityManager,
    journalEntryRepository,
    providerFeeRepository,
    auditLogService,
    { now: () => NOW },
  );

  return {
    useCase, journalEntryRepository, providerFeeRepository, auditLogService, 
  };
}

describe('RecordProviderFeeUseCase', () => {
  it('expenses the fee against Platform Fee and credits Platform Clearing', async () => {
    const { useCase, journalEntryRepository } = setup();

    await useCase.execute({
      provider: 'stripe',
      providerReference: 'txn_123',
      currency: 'usd',
      amountMinor: 189,
      occurredAt: OCCURRED_AT,
      actorId: 'system:stripe-webhook',
    });

    expect(journalEntryRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({
        moneyEventKey: expect.stringMatching(/^provider\.fee:/),
        moneyEventKind: PROVIDER_FEE_MONEY_EVENT_KIND,
        currency: 'USD',
        occurredAt: OCCURRED_AT,
        postings: [
          {
            account: { kind: LedgerAccountKind.PLATFORM_FEE, currency: 'USD' },
            amountMinor: -189,
          },
          {
            account: {
              kind: LedgerAccountKind.PLATFORM_CLEARING,
              currency: 'USD',
            },
            amountMinor: 189,
          },
        ],
      }),
      expect.anything(),
    );
  });

  it('stores the fee without any human actor and audits the webhook source', async () => {
    const { useCase, providerFeeRepository, auditLogService } = setup();

    const result = await useCase.execute({
      provider: 'stripe',
      providerReference: 'txn_123',
      currency: 'USD',
      amountMinor: 189,
      occurredAt: OCCURRED_AT,
      actorId: 'system:stripe-webhook',
    });

    const [insertInput, context] = (
      providerFeeRepository.insert as jest.Mock
    ).mock.calls[0] as [InsertProviderFeeInput, unknown];

    expect(context).toEqual({ entityManager: { fork: 'tx' } });
    expect(insertInput).toEqual(
      expect.objectContaining({
        provider: 'stripe',
        providerReference: 'txn_123',
        currency: 'USD',
        amountMinor: 189,
        occurredAt: OCCURRED_AT,
        recordedAt: NOW,
        journalEntryId: 'je-1',
      }),
    );
    expect(insertInput).not.toHaveProperty('createdByUserId');
    expect(insertInput).not.toHaveProperty('recordedBySource');
    expect(result.replayed).toBe(false);

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'finance.provider_fee.recorded',
        entityType: 'provider_fee',
        actor: { actorId: 'system:stripe-webhook' },
        summary: expect.objectContaining({
          source: 'webhook',
          provider: 'stripe',
          providerReference: 'txn_123',
          amountMinor: 189,
        }),
      }),
    );
  });

  it('records a negative reversal fee with its sign reversed in the postings', async () => {
    const { useCase, journalEntryRepository } = setup();

    await useCase.execute({
      provider: 'stripe',
      providerReference: 'txn_reversal',
      currency: 'USD',
      amountMinor: -189,
      occurredAt: OCCURRED_AT,
      actorId: 'system:stripe-webhook',
    });

    expect(journalEntryRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({
        postings: [
          {
            account: { kind: LedgerAccountKind.PLATFORM_FEE, currency: 'USD' },
            amountMinor: 189,
          },
          {
            account: {
              kind: LedgerAccountKind.PLATFORM_CLEARING,
              currency: 'USD',
            },
            amountMinor: -189,
          },
        ],
      }),
      expect.anything(),
    );
  });

  it('returns the recorded fee and writes nothing on a replay', async () => {
    const existing = buildFee();
    const {
      useCase,
      journalEntryRepository,
      providerFeeRepository,
      auditLogService,
    } = setup({ existing });

    const result = await useCase.execute({
      provider: 'stripe',
      providerReference: 'txn_123',
      currency: 'USD',
      amountMinor: 189,
      occurredAt: OCCURRED_AT,
      actorId: 'system:stripe-webhook',
    });

    expect(result).toEqual({ fee: existing, replayed: true });
    expect(providerFeeRepository.lockProviderReference).toHaveBeenCalledWith(
      'stripe',
      'txn_123',
      { entityManager: { fork: 'tx' } },
    );
    expect(journalEntryRepository.append).not.toHaveBeenCalled();
    expect(providerFeeRepository.insert).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('refuses a zero fee before writing anything', async () => {
    const { useCase, journalEntryRepository, providerFeeRepository } = setup();

    await expect(
      useCase.execute({
        provider: 'stripe',
        providerReference: 'txn_123',
        currency: 'USD',
        amountMinor: 0,
        occurredAt: OCCURRED_AT,
        actorId: 'system:stripe-webhook',
      }),
    ).rejects.toThrow('zero minor units does not describe money that moved');

    expect(journalEntryRepository.append).not.toHaveBeenCalled();
    expect(providerFeeRepository.insert).not.toHaveBeenCalled();
  });
});
