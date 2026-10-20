import { Injectable } from '@nestjs/common';
import {
  PayoutGateway,
  type PayoutTransferInput,
  type PayoutTransferResult,
} from '../app/ports/payout-gateway';

/**
 * The `manual_bank` adapter: pays the recorded Payout Account out of band
 * rather than through a provider API. There is no external system to mint a
 * reference, so the Payout's own public id is what an operator quotes when the
 * bank transfer is made and what Reconciliation matches against later.
 *
 * A provider implementation with tokenised per-shop accounts replaces this
 * without changing the port or what the ledger records.
 */
@Injectable()
export class ManualBankPayoutGateway extends PayoutGateway {
  async send(input: PayoutTransferInput): Promise<PayoutTransferResult> {
    return { reference: input.payoutPublicId };
  }
}
