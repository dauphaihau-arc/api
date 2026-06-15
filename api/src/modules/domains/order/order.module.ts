import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProcessOrderRefundJob } from '~/common/jobs/process-order-refund.job';
import {
  CHECKOUT_CONFIG,
  buildCheckoutConfig
} from '~/config/checkout.config';
import { AuthModule } from '../auth/auth.module';
import { CurrentUserEntity } from '../auth/infra/persistence/entities/current-user.entity';
import { CartModule } from '../cart/cart.module';
import { CouponModule } from '../coupon/coupon.module';
import { ProductModule } from '../product/product.module';
import { CouponUsageEntity } from '../coupon/infra/persistence/entities/coupon-usage.entity';
import { ProductEntity } from '../product/infra/persistence/entities/product.entity';
import { ProductInventoryEntity } from '../product/infra/persistence/entities/product-inventory.entity';
import { ProductVariantEntity } from '../product/infra/persistence/entities/product-variant.entity';
import { ShopEntity } from '../shop/infra/persistence/entities/shop.entity';
import { AdminOrderController } from './api/rest/admin-order.controller';
import { MeOrderController } from './api/rest/me-order.controller';
import { CheckoutController } from './api/rest/checkout.controller';
import { OrderWebhookController } from './api/rest/order-webhook.controller';
import { ShopOrderController } from './api/rest/shop-order.controller';
import { OrderCancellationService } from './app/order-cancellation.service';
import { OrderCheckoutService } from './app/order-checkout.service';
import { OrderRefundService } from './app/order-refund.service';
import { OrderPaymentService } from './app/order-payment.service';
import { OrderTotalPolicyService } from './app/order-total-policy.service';
import { GuestOrderTrackingTokenService } from './app/guest-order-tracking-token.service';
import { CreateGuestCheckoutQuoteForBuyNowUseCase } from './app/use-cases/create-guest-checkout-quote-for-buy-now/create-guest-checkout-quote-for-buy-now.use-case';
import { CreateGuestOrderForBuyNowUseCase } from './app/use-cases/create-guest-order-for-buy-now/create-guest-order-for-buy-now.use-case';
import { CreateGuestCheckoutQuoteFromCartUseCase } from './app/use-cases/create-guest-checkout-quote-from-cart/create-guest-checkout-quote-from-cart.use-case';
import { CreateCheckoutQuoteForBuyNowUseCase } from './app/use-cases/create-checkout-quote-for-buy-now/create-checkout-quote-for-buy-now.use-case';
import { CreateGuestOrderFromCartUseCase } from './app/use-cases/create-guest-order-from-cart/create-guest-order-from-cart.use-case';
import { CreateCheckoutQuoteFromCartUseCase } from './app/use-cases/create-checkout-quote-from-cart/create-checkout-quote-from-cart.use-case';
import { CreateOrderForBuyNowUseCase } from './app/use-cases/create-order-for-buy-now/create-order-for-buy-now.use-case';
import { CreateOrderFromCartUseCase } from './app/use-cases/create-order-from-cart/create-order-from-cart.use-case';
import { GetAdminOrderByIdUseCase } from './app/use-cases/get-admin-order-by-id/get-admin-order-by-id.use-case';
import { GetMyOrderByIdUseCase } from './app/use-cases/get-my-order-by-id/get-my-order-by-id.use-case';
import { GetShopOrderByIdUseCase } from './app/use-cases/get-shop-order-by-id/get-shop-order-by-id.use-case';
import { GetOrdersByCheckoutSessionUseCase } from './app/use-cases/get-orders-by-checkout-session/get-orders-by-checkout-session.use-case';
import { HandleStripeWebhookUseCase } from './app/use-cases/handle-stripe-webhook/handle-stripe-webhook.use-case';
import { ListAdminOrdersUseCase } from './app/use-cases/list-admin-orders/list-admin-orders.use-case';
import { ListOrdersUseCase } from './app/use-cases/list-orders/list-orders.use-case';
import { ListShopOrdersUseCase } from './app/use-cases/list-shop-orders/list-shop-orders.use-case';
import { LookupGuestOrdersUseCase } from './app/use-cases/lookup-guest-orders/lookup-guest-orders.use-case';
import { RequestOrderCancelUseCase } from './app/use-cases/request-order-cancel/request-order-cancel.use-case';
import { RequestOrderSupportUseCase } from './app/use-cases/request-order-support/request-order-support.use-case';
import { UpdateAdminOrderStatusUseCase } from './app/use-cases/update-admin-order-status/update-admin-order-status.use-case';
import { UpdateAdminOrderRefundUseCase } from './app/use-cases/update-admin-order-refund/update-admin-order-refund.use-case';
import { UpdateAdminOrderSupportNoteUseCase } from './app/use-cases/update-admin-order-support-note/update-admin-order-support-note.use-case';
import { CreateCheckoutQuoteService } from './app/create-checkout-quote.service';
import { LoadCheckoutQuoteService } from './app/load-checkout-quote.service';
import { OrderCheckoutOutboxService } from './app/order-checkout-outbox.service';
import { OrderEventsService } from './app/order-events.service';
import { CheckoutQuoteEntity } from './infra/persistence/entities/checkout-quote.entity';
import { CheckoutQuoteItemEntity } from './infra/persistence/entities/checkout-quote-item.entity';
import { OrderEventEntity } from './infra/persistence/entities/order-event.entity';
import { OutboxEventEntity } from './infra/persistence/entities/outbox-event.entity';
import { OrderEntity } from './infra/persistence/entities/order.entity';
import { OrderItemEntity } from './infra/persistence/entities/order-item.entity';
import { PaymentModule } from '../../shared/payment/payment.module';
import { NotificationModule } from '../../shared/notification/notification.module';
import { QueueModule } from '../../shared/queue/queue.module';
import { SseModule } from '../../shared/sse/sse.module';
import { UserModule } from '../user/user.module';
import { ShopModule } from '../shop/shop.module';
import { ForwardOrderUpdatedToSseListener } from './listeners/forward-order-updated-to-sse.listener';
import { UpdateShopOrderShipmentUseCase } from './app/use-cases/update-shop-order-shipment/update-shop-order-shipment.use-case';
import { UpdateShopOrderStatusUseCase } from './app/use-cases/update-shop-order-status/update-shop-order-status.use-case';
import { UpdateShopOrderRefundUseCase } from './app/use-cases/update-shop-order-refund/update-shop-order-refund.use-case';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AuthModule),
    CartModule,
    CouponModule,
    ProductModule,
    PaymentModule,
    NotificationModule,
    forwardRef(() => QueueModule),
    SseModule,
    UserModule,
    ShopModule,
    MikroOrmModule.forFeature([
      OutboxEventEntity,
      OrderEventEntity,
      CheckoutQuoteEntity,
      CheckoutQuoteItemEntity,
      OrderEntity,
      OrderItemEntity,
      CouponUsageEntity,
      CurrentUserEntity,
      ShopEntity,
      ProductEntity,
      ProductInventoryEntity,
      ProductVariantEntity,
    ]),
  ],
  controllers: [
    AdminOrderController,
    CheckoutController,
    MeOrderController,
    OrderWebhookController,
    ShopOrderController,
  ],
  providers: [
    {
      provide: CHECKOUT_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildCheckoutConfig(configService),
    },
    OrderCheckoutService,
    OrderTotalPolicyService,
    CreateCheckoutQuoteService,
    LoadCheckoutQuoteService,
    OrderCancellationService,
    OrderRefundService,
    OrderCheckoutOutboxService,
    OrderEventsService,
    OrderPaymentService,
    GuestOrderTrackingTokenService,
    CreateGuestCheckoutQuoteFromCartUseCase,
    CreateGuestCheckoutQuoteForBuyNowUseCase,
    CreateGuestOrderFromCartUseCase,
    CreateGuestOrderForBuyNowUseCase,
    CreateCheckoutQuoteFromCartUseCase,
    CreateCheckoutQuoteForBuyNowUseCase,
    CreateOrderFromCartUseCase,
    CreateOrderForBuyNowUseCase,
    GetAdminOrderByIdUseCase,
    GetMyOrderByIdUseCase,
    GetOrdersByCheckoutSessionUseCase,
    ListAdminOrdersUseCase,
    LookupGuestOrdersUseCase,
    RequestOrderCancelUseCase,
    RequestOrderSupportUseCase,
    HandleStripeWebhookUseCase,
    ListOrdersUseCase,
    ListShopOrdersUseCase,
    GetShopOrderByIdUseCase,
    UpdateAdminOrderStatusUseCase,
    UpdateAdminOrderRefundUseCase,
    UpdateAdminOrderSupportNoteUseCase,
    UpdateShopOrderStatusUseCase,
    UpdateShopOrderShipmentUseCase,
    UpdateShopOrderRefundUseCase,
    ForwardOrderUpdatedToSseListener,
    ProcessOrderRefundJob,
  ],
  exports: [OrderCheckoutOutboxService, OrderRefundService, ProcessOrderRefundJob],
})
export class OrderModule {}
