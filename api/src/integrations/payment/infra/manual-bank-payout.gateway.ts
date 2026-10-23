import { Injectable } from '@nestjs/common';
import {
  PayoutGateway,
  type PayoutTransferInput,
  type PayoutTransferResult,
} from '../app/ports/payout-gateway';

const DEFAULT_FAIL_REASON = 'stub_provider_decline';
const DEFAULT_FAIL_MODE: PayoutStubFailMode = 'error';
const STUB_ENV_KEYS = [
  'PAYOUT_STUB_FAIL_ATTEMPTS',
  'PAYOUT_STUB_FAIL_REASON',
  'PAYOUT_STUB_FAIL_MODE',
] as const;

/**
 * How a stubbed failure manifests. The port contract raises a provider refusal
 * as an error either way, so the mode only changes the message the recorded
 * `payouts.reason` gets: `error` reads like a timeout/exception, `declined` like
 * an explicit refusal whose message is exactly the configured reason.
 */
export type PayoutStubFailMode = 'error' | 'declined';

/**
 * The `manual_bank` adapter: pays the recorded Payout Account out of band
 * rather than through a provider API. There is no external system to mint a
 * reference, so the Payout's own public id is what an operator quotes when the
 * bank transfer is made and what Reconciliation matches against later.
 *
 * Local/test only, it can fail deterministically: `PAYOUT_STUB_FAIL_ATTEMPTS`
 * makes the first N sends per Payout throw, so the retry and terminal-failure
 * paths are exercised without waiting for a real provider. The counters live in
 * memory and are therefore per process, which is enough because a Payout's
 * first attempt runs in the API and its retries in the worker: each process
 * fails its own slice of attempts. Never set these in production.
 *
 * A provider implementation with tokenised per-shop accounts replaces this
 * without changing the port or what the ledger records.
 */
@Injectable()
export class ManualBankPayoutGateway extends PayoutGateway {
  private readonly failAttempts: number;
  private readonly failReason: string;
  private readonly failMode: PayoutStubFailMode;
  private readonly sendCountByPayoutId = new Map<string, number>();

  constructor(env: NodeJS.ProcessEnv = process.env) {
    super();

    const rawFailAttempts = env.PAYOUT_STUB_FAIL_ATTEMPTS?.trim() ?? '';
    const rawFailReason = env.PAYOUT_STUB_FAIL_REASON?.trim() ?? '';
    const rawFailMode = env.PAYOUT_STUB_FAIL_MODE?.trim().toLowerCase() ?? '';
    const configured = [rawFailAttempts, rawFailReason, rawFailMode];

    if (configured.some((value) => value.length > 0) && env.NODE_ENV === 'production') {
      throw new Error(
        `${STUB_ENV_KEYS.join(', ')} are local/test-only switches and must not be set in production`,
      );
    }

    this.failAttempts = parseStubFailAttempts(rawFailAttempts);
    this.failReason = rawFailReason || DEFAULT_FAIL_REASON;
    this.failMode = parseStubFailMode(rawFailMode);
  }

  async send(input: PayoutTransferInput): Promise<PayoutTransferResult> {
    const previousSends = this.sendCountByPayoutId.get(input.payoutPublicId) ?? 0;

    this.sendCountByPayoutId.set(input.payoutPublicId, previousSends + 1);

    if (previousSends < this.failAttempts) {
      throw new Error(this.buildFailureMessage(input.payoutPublicId));
    }

    return { reference: input.payoutPublicId };
  }

  private buildFailureMessage(payoutPublicId: string): string {
    if (this.failMode === 'declined') {
      return this.failReason;
    }

    return `Stub payout provider error for ${payoutPublicId}: ${this.failReason}`;
  }
}

function parseStubFailAttempts(value: string): number {
  if (value.length === 0) {
    return 0;
  }

  const attempts = Number(value);

  if (!Number.isInteger(attempts) || attempts < 0) {
    throw new Error(
      `PAYOUT_STUB_FAIL_ATTEMPTS must be a non-negative integer, received "${value}"`,
    );
  }

  return attempts;
}

function parseStubFailMode(value: string): PayoutStubFailMode {
  if (value.length === 0) {
    return DEFAULT_FAIL_MODE;
  }

  if (value !== 'error' && value !== 'declined') {
    throw new Error(
      `PAYOUT_STUB_FAIL_MODE must be "error" or "declined", received "${value}"`,
    );
  }

  return value;
}
