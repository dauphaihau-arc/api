/**
 * The outcome of one Order Refund. A refund starts pending when it is
 * requested, becomes succeeded once the provider has moved the money, and
 * becomes failed when the provider refuses it or an operator records the
 * failure. Only a succeeded refund is a Money Event.
 */
export enum OrderRefundStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}
