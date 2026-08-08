import { appJobName } from './app-job.names';
import type { AppJobName } from './app-job.types';

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
      bucket,
    );
  },
  sendWelcomeEmail(userId: string): string {
    return buildJobDeduplicationKey(appJobName.sendWelcomeEmail, userId);
  },
  sendGuestOrderConfirmationEmail(email: string, orderIds: string[]): string {
    return buildJobDeduplicationKey(
      appJobName.sendGuestOrderConfirmationEmail,
      email,
      orderIds.join('-'),
    );
  },
  processOrderRefund(orderId: string): string {
    return buildJobDeduplicationKey(
      appJobName.processOrderRefund,
      orderId,
    );
  },
  processShopOrderExport(exportId: string): string {
    return buildJobDeduplicationKey(
      appJobName.processShopOrderExport,
      exportId,
    );
  },
  sendWebPushNotification(userId: string, notificationId: string): string {
    return buildJobDeduplicationKey(
      appJobName.sendWebPushNotification,
      userId,
      notificationId,
    );
  },
  generateProductImageVariants(productId: string): string {
    return buildJobDeduplicationKey(
      appJobName.generateProductImageVariants,
      productId,
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
      productId,
    );
  },
  cleanupPendingReviewImage(storageKey: string): string {
    return buildJobDeduplicationKey(
      appJobName.cleanupPendingReviewImage,
      storageKey,
    );
  },
  processProductImport(importId: string): string {
    return buildJobDeduplicationKey(
      appJobName.processProductImport,
      importId,
    );
  },
  cleanupExpiredCheckoutQuoteReservations(quoteId: string): string {
    return buildJobDeduplicationKey(
      appJobName.cleanupExpiredCheckoutQuoteReservations,
      quoteId,
    );
  },
  refreshBestSellerRankings(windowDays: number): string {
    return buildJobDeduplicationKey(
      appJobName.refreshBestSellerRankings,
      windowDays,
    );
  },
} as const;
