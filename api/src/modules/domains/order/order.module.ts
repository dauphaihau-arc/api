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
import { OrderController } from './api/rest/order.controller';
import { OrderWebhookController } from './api/rest/order-webhook.controller';
import { OrderCheckoutService } from './app/order-checkout.service';
import { OrderPaymentService } from './app/order-payment.service';
import { CreateOrderForBuyNowUseCase } from './app/use-cases/create-order-for-buy-now/create-order-for-buy-now.use-case';
import { CreateOrderFromCartUseCase } from './app/use-cases/create-order-from-cart/create-order-from-cart.use-case';
import { GetOrdersByCheckoutSessionUseCase } from './app/use-cases/get-orders-by-checkout-session/get-orders-by-checkout-session.use-case';
import { HandleStripeWebhookUseCase } from './app/use-cases/handle-stripe-webhook/handle-stripe-webhook.use-case';
import { ListOrdersUseCase } from './app/use-cases/list-orders/list-orders.use-case';
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
  controllers: [OrderController, OrderWebhookController],
  providers: [
    OrderCheckoutService,
    OrderPaymentService,
    CreateOrderFromCartUseCase,
    CreateOrderForBuyNowUseCase,
    GetOrdersByCheckoutSessionUseCase,
    HandleStripeWebhookUseCase,
    ListOrdersUseCase,
  ],
})
export class OrderModule {}
