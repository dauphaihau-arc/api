import { ProviderEvidenceRepository } from '../../ports/provider-evidence.repository';
import type {
  InsertProviderTransferEventInput,
  UpsertConnectedPayoutInput,
} from '../../ports/provider-evidence.repository';
import { RecordConnectedPayoutUseCase } from './record-connected-payout.use-case';

class InMemoryProviderEvidenceRepository extends ProviderEvidenceRepository {
  readonly transferEvents = new Map<string, InsertProviderTransferEventInput>();
  readonly connectedPayouts = new Map<string, UpsertConnectedPayoutInput>();

  async findPayoutIdByProviderReference(): Promise<string | null> {
    return null;
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
    useCase: new RecordConnectedPayoutUseCase(repository),
    repository,
  };
}

const OCCURRED_AT = new Date('2026-10-24T10:00:00.000Z');

describe('RecordConnectedPayoutUseCase', () => {
  it('records a paid connected payout for an unknown account', async () => {
    const { useCase, repository } = buildUseCase();

    const result = await useCase.execute({
      providerPayoutId: 'po_1',
      accountId: 'acct_unknown',
      status: 'paid',
      amountMinor: 12_500,
      currency: 'usd',
      arrivalDate: '2026-10-25',
      failureCode: null,
      occurredAt: OCCURRED_AT,
    });

    expect(result).toEqual({ created: true });
    expect(repository.connectedPayouts.get('po_1')).toEqual({
      providerPayoutId: 'po_1',
      providerAccountId: 'acct_unknown',
      status: 'paid',
      amountMinor: 12_500,
      currency: 'USD',
      arrivalDate: '2026-10-25',
      failureCode: null,
      occurredAt: OCCURRED_AT,
    });
  });

  it('updates the same row when a failed payout is later reported paid', async () => {
    const { useCase, repository } = buildUseCase();

    await useCase.execute({
      providerPayoutId: 'po_2',
      accountId: 'acct_1',
      status: 'failed',
      amountMinor: 12_500,
      currency: 'usd',
      arrivalDate: '2026-10-25',
      failureCode: 'account_closed',
      occurredAt: new Date('2026-10-24T10:00:00.000Z'),
    });
    const second = await useCase.execute({
      providerPayoutId: 'po_2',
      accountId: 'acct_1',
      status: 'paid',
      amountMinor: 12_500,
      currency: 'usd',
      arrivalDate: '2026-10-26',
      failureCode: 'account_closed',
      occurredAt: new Date('2026-10-25T10:00:00.000Z'),
    });

    expect(second).toEqual({ created: false });
    expect(repository.connectedPayouts.size).toBe(1);
    // A paid payout keeps no failure code from an earlier report.
    expect(repository.connectedPayouts.get('po_2')).toMatchObject({
      status: 'paid',
      arrivalDate: '2026-10-26',
      failureCode: null,
    });
  });
});
