export const appJobName = {
  refreshExchangeRates: 'fx.refresh-rates',
  sendWelcomeEmail: 'user.send-welcome-email',
  sendPasswordResetEmail: 'user.send-password-reset-email',
  sendGuestOrderConfirmationEmail: 'order.send-guest-confirmation-email',
  processOrderRefund: 'order.process-refund',
  sendRefundSucceededEmail: 'order.send-refund-succeeded-email',
  sendRefundFailedEmail: 'order.send-refund-failed-email',
  sendSellerOrderUpdateEmail: 'order.send-seller-order-update-email',
  sendWebPushNotification: 'notification.send-web-push',
  generateProductImageVariants: 'product.generate-image-variants',
  generateReviewImageVariants: 'product-review.generate-image-variants',
  projectCatalogProduct: 'catalog.project-product',
  cleanupPendingReviewImage: 'product.cleanup-pending-review-image',
} as const;

export interface AppJobPayloadMap {
  [appJobName.refreshExchangeRates]: {
    requestedAt: string;
  };
  [appJobName.sendWelcomeEmail]: {
    userId: string;
    email: string;
    displayName?: string;
  };
  [appJobName.sendPasswordResetEmail]: {
    userId: string;
    email: string;
    displayName?: string;
    resetUrl: string;
  };
  [appJobName.sendGuestOrderConfirmationEmail]: {
    email: string;
    orderIds: string[];
    trackingUrl: string;
    shopNames: string[];
  };
  [appJobName.processOrderRefund]: {
    orderId: string;
  };
  [appJobName.sendRefundSucceededEmail]: {
    orderId: string;
  };
  [appJobName.sendRefundFailedEmail]: {
    orderId: string;
  };
  [appJobName.sendSellerOrderUpdateEmail]: {
    orderId: string;
    eventType: 'canceled' | 'refunded';
  };
  [appJobName.sendWebPushNotification]: {
    userId: string;
    notificationId: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  };
  [appJobName.generateProductImageVariants]: {
    productId: string;
  };
  [appJobName.generateReviewImageVariants]: {
    reviewImageId: string;
  };
  [appJobName.projectCatalogProduct]: {
    productId: string;
  };
  [appJobName.cleanupPendingReviewImage]: {
    storageKey: string;
  };
}

export type AppJobName = keyof AppJobPayloadMap;

export interface DispatchJobOptions {
  deduplicationKey?: string;
  delayMs?: number;
}

export function buildJobDeduplicationKey(
  name: AppJobName,
  ...parts: Array<string | number>
): string {
  return [name, ...parts]
    .map((part) => String(part).trim())
    .filter(Boolean)
    .map((part) => part.replace(/[^a-zA-Z0-9_-]/g, '-'))
    .join('--');
}

export const appJobDeduplicationKey = {
  refreshExchangeRates(bucket: string): string {
    return buildJobDeduplicationKey(
      appJobName.refreshExchangeRates,
      bucket
    );
  },
  sendWelcomeEmail(userId: string): string {
    return buildJobDeduplicationKey(appJobName.sendWelcomeEmail, userId);
  },
  sendGuestOrderConfirmationEmail(email: string, orderIds: string[]): string {
    return buildJobDeduplicationKey(
      appJobName.sendGuestOrderConfirmationEmail,
      email,
      orderIds.join('-')
    );
  },
  processOrderRefund(orderId: string): string {
    return buildJobDeduplicationKey(
      appJobName.processOrderRefund,
      orderId
    );
  },
  sendWebPushNotification(userId: string, notificationId: string): string {
    return buildJobDeduplicationKey(
      appJobName.sendWebPushNotification,
      userId,
      notificationId
    );
  },
  generateProductImageVariants(productId: string): string {
    return buildJobDeduplicationKey(
      appJobName.generateProductImageVariants,
      productId
    );
  },
  generateReviewImageVariants(reviewImageId: string): string {
    return buildJobDeduplicationKey(
      appJobName.generateReviewImageVariants,
      reviewImageId,
    );
  },
  projectCatalogProduct(productId: string): string {
    return buildJobDeduplicationKey(
      appJobName.projectCatalogProduct,
      productId
    );
  },
  cleanupPendingReviewImage(storageKey: string): string {
    return buildJobDeduplicationKey(
      appJobName.cleanupPendingReviewImage,
      storageKey,
    );
  },
} as const;
