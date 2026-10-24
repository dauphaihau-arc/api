import type { FinanceRepositoryContext } from './finance-repository-context';

/** One recorded Provider Fee, as the application and HTTP layers see it. */
export interface ProviderFeeRecord {
  id: string;
  provider: string;
  providerReference: string;
  currency: string;
  /** The signed fee in minor units: positive charge, negative reversal. */
  amountMinor: number;
  occurredAt: Date;
  recordedAt: Date;
  journalEntryId: string;
  /** The Money Event key of the fee's Journal Entry. */
  journalEntryKey: string;
}

export interface InsertProviderFeeInput {
  id: string;
  provider: string;
  providerReference: string;
  currency: string;
  /** The signed fee in minor units: positive charge, negative reversal. */
  amountMinor: number;
  occurredAt: Date;
  recordedAt: Date;
  journalEntryId: string;
}

export abstract class ProviderFeeRepository {
  /**
   * Serializes recording for one `(provider, providerReference)` inside the
   * caller's transaction. A lookup-then-insert without this would let two
   * concurrent recordings write two Journal Entries for one provider charge.
   */
  abstract lockProviderReference(
    provider: string,
    providerReference: string,
    context: FinanceRepositoryContext,
  ): Promise<void>;

  abstract findByProviderReference(
    provider: string,
    providerReference: string,
    context?: FinanceRepositoryContext,
  ): Promise<ProviderFeeRecord | null>;

  /**
   * Records one Provider Fee row. The caller has already appended the Journal
   * Entry the row points at; the insert joins the caller's transaction so the
   * charge and its entry land together or not at all.
   */
  abstract insert(
    input: InsertProviderFeeInput,
    context: FinanceRepositoryContext,
  ): Promise<ProviderFeeRecord>;
}
