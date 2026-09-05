export interface AppJobPayloadMap {
  'fx.refresh-rates': {
    requestedAt: string;
  };
  'user.send-welcome-email': {
    userId: string;
    email: string;
    displayName?: string;
  };
  'user.send-password-reset-email': {
    userId: string;
    email: string;
    displayName?: string;
    resetUrl: string;
  };
  'order.send-guest-confirmation-email': {
    email: string;
    orderIds: string[];
    trackingUrl: string;
    shopNames: string[];
  };
  'order.process-refund': {
    orderId: string;
  };
  'order.send-refund-succeeded-email': {
    orderId: string;
  };
  'order.send-refund-failed-email': {
    orderId: string;
  };
  'order.send-seller-order-update-email': {
    orderId: string;
    eventType: 'canceled' | 'refunded';
  };
  'order.process-shop-order-export': {
    exportId: string;
  };
  'notification.send-web-push': {
    userId: string;
    notificationId: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  };
  'product.generate-image-variants': {
    productId: string;
  };
  'product-review.generate-image-variants': {
    reviewImageId: string;
  };
  'catalog.project-product': {
    productId: string;
  };
  'catalog.project-shop-products': {
    shopId: string;
    productIds?: string[];
  };
  'product.cleanup-pending-review-image': {
    storageKey: string;
  };
  'product.process-import': {
    importId: string;
  };
  'order.cleanup-expired-checkout-quote-reservations': {
    quoteId: string;
    productIds?: string[];
  };
  'product.refresh-best-seller-rankings': {
    windowDays: number;
    limit: number;
  };
}

export type AppJobName = keyof AppJobPayloadMap;

export interface DispatchJobOptions {
  deduplicationKey?: string;
  delayMs?: number;
}
