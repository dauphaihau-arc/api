import type { PayoutState } from '../../domain/rules/payout';

/** One shop with Available Seller Payable that no Payout has discharged yet. */
export interface PayableShop {
  shopId: string;
  currency: string;
}

/** One Order's available payable, still undischarged and therefore payable. */
export interface PayableOrderAmount {
  orderId: string;
  amountMinor: number;
}

/** A Payout as the application reads it; the amount is in the shop's Settlement Currency. */
export interface PayoutRecord {
  id: string;
  publicId: string;
  amountMinor: number;
  currency: string;
  state: PayoutState;
  providerReference: string | null;
  paidAt: Date | null;
  createdAt: Date;
}
