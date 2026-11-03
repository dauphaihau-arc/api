/**
 * Lifecycle of a purchased carrier label. A label is purchased with its
 * Shipment, becomes used at the carrier's first scan, and can be voided by a
 * refund while it is still unused.
 */
export enum ShipmentLabelStatus {
  PURCHASED = 'purchased',
  USED = 'used',
  VOIDED = 'voided',
}
