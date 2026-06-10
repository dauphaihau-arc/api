export enum OrderEventType {
  ORDER_CREATED = 'order_created',
  ORDER_STATUS_CHANGED = 'order_status_changed',
  SHIPPING_STATUS_CHANGED = 'shipping_status_changed',
  TRACKING_NUMBER_UPDATED = 'tracking_number_updated',
  SHIPPING_CARRIER_UPDATED = 'shipping_carrier_updated',
  SHIPMENT_NOTE_UPDATED = 'shipment_note_updated',
  CANCEL_REQUESTED = 'cancel_requested',
  PAYMENT_SUCCEEDED = 'payment_succeeded',
  PAYMENT_EXPIRED = 'payment_expired',
  REFUND_REQUESTED = 'refund_requested',
  REFUND_SUCCEEDED = 'refund_succeeded',
  REFUND_FAILED = 'refund_failed',
  REFUND_NOT_REQUIRED = 'refund_not_required'
}
