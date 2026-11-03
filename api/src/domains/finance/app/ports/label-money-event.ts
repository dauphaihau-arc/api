/**
 * A label money event as Finance consumes it. Producer: Fulfillment's label
 * outbox; Finance defines its own copy of the shape so it never imports the
 * producer's type.
 *
 * The amount is already in the shop's Settlement Currency: a label is priced
 * and bought in that currency, so no conversion happens when it is booked.
 */
export interface LabelMoneyEvent {
  /** The public label id (`lbl_...`); the Money Event identity of the label. */
  labelId: string;
  shopId: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  occurredAt: string;
}

/** The outbox event name Finance owns for a purchased Label's charge. */
export const LABEL_CHARGED_MONEY_EVENT_NAME = 'label.charged';

/** The outbox event name Finance owns for a refunded Label's reversal. */
export const LABEL_REFUNDED_MONEY_EVENT_NAME = 'label.refunded';
