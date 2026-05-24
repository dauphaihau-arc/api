import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { CurrentUserEntity } from '../auth/infra/persistence/entities/current-user.entity';
import { CartModule } from '../cart/cart.module';
import { CouponModule } from '../coupon/coupon.module';
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
import { OrderPaymentService } from './app/order-payment.service';
import { GuestOrderTrackingTokenService } from './app/guest-order-tracking-token.service';
import { CreateGuestOrderForBuyNowUseCase } from './app/use-cases/create-guest-order-for-buy-now/create-guest-order-for-buy-now.use-case';
import { CreateGuestOrderFromCartUseCase } from './app/use-cases/create-guest-order-from-cart/create-guest-order-from-cart.use-case';
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
import { UpdateAdminOrderSupportNoteUseCase } from './app/use-cases/update-admin-order-support-note/update-admin-order-support-note.use-case';
import { OrderCheckoutOutboxService } from './app/order-checkout-outbox.service';
import { OutboxEventEntity } from './infra/persistence/entities/outbox-event.entity';
import { OrderEntity } from './infra/persistence/entities/order.entity';
import { OrderItemEntity } from './infra/persistence/entities/order-item.entity';
import { PaymentModule } from '../../shared/payment/payment.module';
import { QueueModule } from '../../shared/queue/queue.module';
import { UserModule } from '../user/user.module';
import { ShopModule } from '../shop/shop.module';
import { UpdateShopOrderShipmentUseCase } from './app/use-cases/update-shop-order-shipment/update-shop-order-shipment.use-case';
import { UpdateShopOrderStatusUseCase } from './app/use-cases/update-shop-order-status/update-shop-order-status.use-case';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    CartModule,
    CouponModule,
    PaymentModule,
    QueueModule,
    UserModule,
    ShopModule,
    MikroOrmModule.forFeature([
      OutboxEventEntity,
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
    OrderCheckoutService,
    OrderCancellationService,
    OrderCheckoutOutboxService,
    OrderPaymentService,
    GuestOrderTrackingTokenService,
    CreateGuestOrderFromCartUseCase,
    CreateGuestOrderForBuyNowUseCase,
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
    UpdateAdminOrderSupportNoteUseCase,
    UpdateShopOrderStatusUseCase,
    UpdateShopOrderShipmentUseCase,
  ],
  exports: [OrderCheckoutOutboxService],
})
export class OrderModule {}
