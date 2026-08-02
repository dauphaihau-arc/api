import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';
import { ProcessOrderRefundJob } from '~/domains/order/jobs/process-order-refund.job';
import { AuthModule } from '../auth/auth.module';
import { CouponModule } from '../coupon/coupon.module';
import { CouponUsageEntity } from '../coupon/infra/persistence/entities/coupon-usage.entity';
import { AdminOrderController } from './api/rest/admin-order.controller';
import { MeOrderController } from './api/rest/me-order.controller';
import { OrderWebhookController } from './api/rest/order-webhook.controller';
import { ShopDashboardController } from './api/rest/shop-dashboard.controller';
import { ShopOrderController } from './api/rest/shop-order.controller';
import { OrderCancellationService } from './app/order-cancellation.service';
import { OrderCheckoutService } from './app/order-checkout.service';
import { OrderRefundService } from './app/order-refund.service';
import { OrderPaymentService } from './app/order-payment.service';
import { OrderTotalPolicyService } from './app/order-total-policy.service';
import { GetAdminOrderByIdUseCase } from './app/use-cases/get-admin-order-by-id/get-admin-order-by-id.use-case';
import { GetMyOrderByIdUseCase } from './app/use-cases/get-my-order-by-id/get-my-order-by-id.use-case';
import { GetShopDashboardUseCase } from './app/use-cases/get-shop-dashboard/get-shop-dashboard.use-case';
import { GetShopOrderByIdUseCase } from './app/use-cases/get-shop-order-by-id/get-shop-order-by-id.use-case';
import { HandleStripeWebhookUseCase } from './app/use-cases/handle-stripe-webhook/handle-stripe-webhook.use-case';
import { ListAdminOrdersUseCase } from './app/use-cases/list-admin-orders/list-admin-orders.use-case';
import { ListOrdersUseCase } from './app/use-cases/list-orders/list-orders.use-case';
import { ListShopOrdersUseCase } from './app/use-cases/list-shop-orders/list-shop-orders.use-case';
import { RequestOrderCancelUseCase } from './app/use-cases/request-order-cancel/request-order-cancel.use-case';
import { RequestOrderSupportUseCase } from './app/use-cases/request-order-support/request-order-support.use-case';
import { UpdateAdminOrderStatusUseCase } from './app/use-cases/update-admin-order-status/update-admin-order-status.use-case';
import { UpdateAdminOrderRefundUseCase } from './app/use-cases/update-admin-order-refund/update-admin-order-refund.use-case';
import { UpdateAdminOrderSupportNoteUseCase } from './app/use-cases/update-admin-order-support-note/update-admin-order-support-note.use-case';
import { OrderCheckoutOutboxService } from './app/order-checkout-outbox.service';
import { OrderEventsService } from './app/order-events.service';
import { ShopDashboardQueryRepository } from './app/ports/shop-dashboard-query.repository';
import { OrderEventEntity } from './infra/persistence/entities/order-event.entity';
import { OutboxEventEntity } from './infra/persistence/entities/outbox-event.entity';
import { OrderEntity } from './infra/persistence/entities/order.entity';
import { OrderItemEntity } from './infra/persistence/entities/order-item.entity';
import { MikroOrmShopDashboardQueryRepository } from './infra/persistence/repositories/mikro-orm-shop-dashboard-query.repository';
import { CheckoutModule } from '../checkout/checkout.module';
import { PaymentModule } from '~/integrations/payment/payment.module';
import { NotificationModule } from '~/integrations/notification/notification.module';
import { QueueModule } from '~/integrations/queue/queue.module';
import { SseModule } from '~/platform/sse/sse.module';
import { StorageModule } from '~/integrations/storage/storage.module';
import { ShopModule } from '../shop/shop.module';
import { ForwardOrderUpdatedToSseListener } from './listeners/forward-order-updated-to-sse.listener';
import { UpdateShopOrderShipmentUseCase } from './app/use-cases/update-shop-order-shipment/update-shop-order-shipment.use-case';
import { UpdateShopOrderStatusUseCase } from './app/use-cases/update-shop-order-status/update-shop-order-status.use-case';
import { UpdateShopOrderRefundUseCase } from './app/use-cases/update-shop-order-refund/update-shop-order-refund.use-case';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => CheckoutModule),
    CouponModule,
    PaymentModule,
    NotificationModule,
    forwardRef(() => QueueModule),
    SseModule,
    StorageModule,
    ShopModule,
    MikroOrmModule.forFeature([
      OutboxEventEntity,
      OrderEventEntity,
      OrderEntity,
      OrderItemEntity,
      CouponUsageEntity,
    ]),
  ],
  controllers: [
    AdminOrderController,
    MeOrderController,
    OrderWebhookController,
    ShopDashboardController,
    ShopOrderController,
  ],
  providers: [
    {
      provide: ShopDashboardQueryRepository,
      useClass: MikroOrmShopDashboardQueryRepository,
    },
    OrderCheckoutService,
    OrderTotalPolicyService,
    OrderCancellationService,
    OrderRefundService,
    OrderCheckoutOutboxService,
    OrderEventsService,
    OrderPaymentService,
    GetAdminOrderByIdUseCase,
    GetMyOrderByIdUseCase,
    ListAdminOrdersUseCase,
    RequestOrderCancelUseCase,
    RequestOrderSupportUseCase,
    HandleStripeWebhookUseCase,
    ListOrdersUseCase,
    ListShopOrdersUseCase,
    GetShopDashboardUseCase,
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
  exports: [
    OrderCheckoutService,
    OrderPaymentService,
    OrderTotalPolicyService,
    OrderCheckoutOutboxService,
    OrderRefundService,
    ProcessOrderRefundJob,
  ],
})
export class OrderModule {}
