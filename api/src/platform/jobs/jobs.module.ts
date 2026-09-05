import { Module } from '@nestjs/common';
import { AuthModule } from '~/domains/auth/auth.module';
import { SendPasswordResetEmailJob } from '~/domains/auth/jobs/send-password-reset-email.job';
import { CheckoutModule } from '~/domains/checkout/checkout.module';
import { CleanupExpiredCheckoutQuoteReservationsJob } from '~/domains/checkout/jobs/cleanup-expired-checkout-quote-reservations.job';
import { NotificationModule } from '~/domains/notification/notification.module';
import { SendWebPushNotificationJob } from '~/domains/notification/jobs/send-web-push-notification.job';
import { OrderModule } from '~/domains/order/order.module';
import { ProcessOrderRefundJob } from '~/domains/order/jobs/process-order-refund.job';
import { ProcessShopOrderExportJob } from '~/domains/order/jobs/process-shop-order-export.job';
import { SendGuestOrderConfirmationEmailJob } from '~/domains/order/jobs/send-guest-order-confirmation-email.job';
import { SendRefundFailedEmailJob } from '~/domains/order/jobs/send-refund-failed-email.job';
import { SendRefundSucceededEmailJob } from '~/domains/order/jobs/send-refund-succeeded-email.job';
import { SendSellerOrderUpdateEmailJob } from '~/domains/order/jobs/send-seller-order-update-email.job';
import { ProductModule } from '~/domains/product/product.module';
import { CleanupPendingReviewImageJob } from '~/domains/product/jobs/cleanup-pending-review-image.job';
import { GenerateProductImageVariantsJob } from '~/domains/product/jobs/generate-product-image-variants.job';
import { GenerateReviewImageVariantsJob } from '~/domains/product/jobs/generate-review-image-variants.job';
import { ProjectCatalogProductJob } from '~/domains/product/jobs/project-catalog-product.job';
import { ProjectShopCatalogProductsJob } from '~/domains/product/jobs/project-shop-catalog-products.job';
import { RefreshBestSellerRankingsJob } from '~/domains/product/jobs/refresh-best-seller-rankings.job';
import { SendWelcomeEmailJob } from '~/domains/user/jobs/send-welcome-email.job';
import { CurrencyModule } from '~/integrations/currency/currency.module';
import { RefreshExchangeRatesJob } from '~/integrations/currency/jobs/refresh-exchange-rates.job';
import { MailModule } from '~/integrations/mail/mail.module';
import { QueueModule } from '~/integrations/queue/queue.module';
import { StorageModule } from '~/integrations/storage/storage.module';
import { AppJobRunner } from './app-job-runner';
import { JobRunner } from './job-runner';

@Module({
  imports: [
    AuthModule,
    CheckoutModule,
    CurrencyModule,
    MailModule,
    NotificationModule,
    OrderModule,
    ProductModule,
    StorageModule,
    QueueModule,
  ],
  providers: [
    AppJobRunner,
    {
      provide: JobRunner,
      useExisting: AppJobRunner,
    },
    RefreshExchangeRatesJob,
    SendWelcomeEmailJob,
    SendPasswordResetEmailJob,
    SendGuestOrderConfirmationEmailJob,
    SendRefundSucceededEmailJob,
    SendRefundFailedEmailJob,
    SendSellerOrderUpdateEmailJob,
    SendWebPushNotificationJob,
    ProcessOrderRefundJob,
    ProcessShopOrderExportJob,
    GenerateProductImageVariantsJob,
    GenerateReviewImageVariantsJob,
    ProjectCatalogProductJob,
    ProjectShopCatalogProductsJob,
    CleanupPendingReviewImageJob,
    CleanupExpiredCheckoutQuoteReservationsJob,
    RefreshBestSellerRankingsJob,
  ],
  exports: [AppJobRunner, JobRunner],
})
export class JobsModule {}
