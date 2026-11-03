/** Outbox event name published when a Label is purchased. */
export const LABEL_CHARGED_OUTBOX_EVENT_NAME = 'label.charged';

/** Outbox event name published when a purchased Label is refunded. */
export const LABEL_REFUNDED_OUTBOX_EVENT_NAME = 'label.refunded';

/** The aggregate every Label money event belongs to. */
export const LABEL_OUTBOX_AGGREGATE_TYPE = 'shipment_label';

/**
 * The money facts of a Label as the outbox payload carries them. The amount is
 * in the shop's Settlement Currency; a Label is bought and refunded in it.
 */
export interface LabelMoneyEventPayload {
  labelId: string;
  shopId: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  occurredAt: string;
}

export interface LabelMoneyEventInput {
  labelId: string;
  shopId: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  occurredAt: Date;
}

export function buildLabelMoneyEvent(
  input: LabelMoneyEventInput,
): LabelMoneyEventPayload {
  return {
    labelId: input.labelId,
    shopId: input.shopId,
    orderId: input.orderId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    occurredAt: input.occurredAt.toISOString(),
  };
}
