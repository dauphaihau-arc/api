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
import { MeOrderController } from './api/rest/me-order.controller';
import { OrderWebhookController } from './api/rest/order-webhook.controller';
import { OrderCheckoutService } from './app/order-checkout.service';
import { OrderPaymentService } from './app/order-payment.service';
import { CreateOrderForBuyNowUseCase } from './app/use-cases/create-order-for-buy-now/create-order-for-buy-now.use-case';
import { CreateOrderFromCartUseCase } from './app/use-cases/create-order-from-cart/create-order-from-cart.use-case';
import { GetOrdersByCheckoutSessionUseCase } from './app/use-cases/get-orders-by-checkout-session/get-orders-by-checkout-session.use-case';
import { HandleStripeWebhookUseCase } from './app/use-cases/handle-stripe-webhook/handle-stripe-webhook.use-case';
import { ListOrdersUseCase } from './app/use-cases/list-orders/list-orders.use-case';
import { OrderCheckoutOutboxService } from './app/order-checkout-outbox.service';
import { OutboxEventEntity } from './infra/persistence/entities/outbox-event.entity';
import { OrderEntity } from './infra/persistence/entities/order.entity';
import { OrderItemEntity } from './infra/persistence/entities/order-item.entity';
import { PaymentModule } from '../../shared/payment/payment.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    CartModule,
    CouponModule,
    PaymentModule,
    UserModule,
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
  controllers: [MeOrderController, OrderWebhookController],
  providers: [
    OrderCheckoutService,
    OrderCheckoutOutboxService,
    OrderPaymentService,
    CreateOrderFromCartUseCase,
    CreateOrderForBuyNowUseCase,
    GetOrdersByCheckoutSessionUseCase,
    HandleStripeWebhookUseCase,
    ListOrdersUseCase,
  ],
  exports: [OrderCheckoutOutboxService],
})
export class OrderModule {}
