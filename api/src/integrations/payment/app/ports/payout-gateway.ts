/**
 * The destination a Payout is sent to, as the provider needs it. `reference` is
 * the decrypted account reference the seller recorded, and it crosses only this
 * boundary: no read surface and no audit entry ever carries it.
 */
export interface PayoutDestinationInput {
  holderName: string;
  bankName: string;
  country: string;
  last4: string;
  reference: string;
}

export interface PayoutTransferInput {
  /** Arc's own identity for the transfer, and the idempotency key for the provider. */
  payoutPublicId: string;

  /** The adapter token the Payout Account was recorded against. */
  provider: string;

  amountMinor: number;
  currency: string;
  destination: PayoutDestinationInput;
}

export interface PayoutTransferResult {
  /** The provider's own reference for the transfer. */
  reference: string;
}

/**
 * The payout adapter: the one seam between Finance's decision to pay and the
 * provider that moves the money. A provider implementation sits beside the
 * payment gateway, so per-shop provider accounts can be adopted later without
 * changing what the ledger records.
 *
 * A refused transfer is raised as an error; the caller decides what a failure
 * means for the Payout.
 */
export abstract class PayoutGateway {
  abstract send(input: PayoutTransferInput): Promise<PayoutTransferResult>;
}
