import { ProviderEvidenceRepository } from '../../ports/provider-evidence.repository';
import type {
  InsertProviderTransferEventInput,
  UpsertConnectedPayoutInput,
} from '../../ports/provider-evidence.repository';
import { RecordTransferEventUseCase } from './record-transfer-event.use-case';

/**
 * An in-memory stand-in that enforces the same idempotency the SQL does, so the
 * use case's replay behavior is exercised without a database.
 */
class InMemoryProviderEvidenceRepository extends ProviderEvidenceRepository {
  readonly transferEvents = new Map<string, InsertProviderTransferEventInput>();
  readonly connectedPayouts = new Map<string, UpsertConnectedPayoutInput>();
  readonly payoutReferences = new Map<string, string>();

  async findPayoutIdByProviderReference(
    providerReference: string,
  ): Promise<string | null> {
    return this.payoutReferences.get(providerReference) ?? null;
  }

  async insertTransferEventIfAbsent(
    input: InsertProviderTransferEventInput,
  ): Promise<boolean> {
    if (this.transferEvents.has(input.providerEventId)) {
      return false;
    }

    this.transferEvents.set(input.providerEventId, input);
    return true;
  }

  async upsertConnectedPayout(
    input: UpsertConnectedPayoutInput,
  ): Promise<boolean> {
    const exists = this.connectedPayouts.has(input.providerPayoutId);
    this.connectedPayouts.set(input.providerPayoutId, input);
    return !exists;
  }
}

function buildUseCase() {
  const repository = new InMemoryProviderEvidenceRepository();

  return {
    useCase: new RecordTransferEventUseCase(repository),
    repository,
  };
}

const OCCURRED_AT = new Date('2026-10-24T10:00:00.000Z');

describe('RecordTransferEventUseCase', () => {
  it('stores a transfer event matched to its Payout by provider reference', async () => {
    const { useCase, repository } = buildUseCase();
    repository.payoutReferences.set('tr_1', 'payout-1');

    const result = await useCase.execute({
      providerEventId: 'evt_1',
      transferId: 'tr_1',
      amountMinor: 12_500,
      currency: 'usd',
      destinationAccountId: 'acct_1',
      reversedAmountMinor: 0,
      status: 'created',
      occurredAt: OCCURRED_AT,
    });

    expect(result).toEqual({ recorded: true, payoutId: 'payout-1' });
    expect(repository.transferEvents.get('evt_1')).toEqual({
      providerEventId: 'evt_1',
      transferId: 'tr_1',
      payoutId: 'payout-1',
      status: 'created',
      amountMinor: 12_500,
      currency: 'USD',
      reversedAmountMinor: 0,
      destinationAccountId: 'acct_1',
      occurredAt: OCCURRED_AT,
    });
  });

  it('keeps an unmatched transfer with a null Payout', async () => {
    const { useCase, repository } = buildUseCase();

    const result = await useCase.execute({
      providerEventId: 'evt_2',
      transferId: 'tr_2',
      amountMinor: 9_900,
      currency: 'usd',
      destinationAccountId: 'acct_1',
      reversedAmountMinor: 1_000,
      status: 'reversed',
      occurredAt: OCCURRED_AT,
    });

    expect(result).toEqual({ recorded: true, payoutId: null });
    expect(repository.transferEvents.get('evt_2')).toMatchObject({
      payoutId: null,
      reversedAmountMinor: 1_000,
    });
  });

  it('records a replayed provider event id once', async () => {
    const { useCase, repository } = buildUseCase();
    const input = {
      providerEventId: 'evt_3',
      transferId: 'tr_3',
      amountMinor: 12_500,
      currency: 'usd',
      destinationAccountId: 'acct_1',
      reversedAmountMinor: 0,
      status: 'created' as const,
      occurredAt: OCCURRED_AT,
    };

    const first = await useCase.execute(input);
    const second = await useCase.execute(input);

    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(false);
    expect(repository.transferEvents.size).toBe(1);
  });
});
