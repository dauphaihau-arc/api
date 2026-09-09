import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProcessOrderRefundJob } from '~/domains/order/jobs/process-order-refund.job';
import { ProcessShopOrderExportJob } from '~/domains/order/jobs/process-shop-order-export.job';
import {
  RABBITMQ_CONFIG,
  buildRabbitMqConfig,
} from '~/platform/config/rabbitmq.config';
import { AuthModule } from '../auth/auth.module';
import { CouponModule } from '../coupon/coupon.module';
import { CouponUsageEntity } from '../coupon/infra/persistence/entities/coupon-usage.entity';
import { AdminOrderController } from './api/rest/admin-order.controller';
import { MeOrderController } from './api/rest/me-order.controller';
import { OrderWebhookController } from './api/rest/order-webhook.controller';
import { ShopDashboardController } from './api/rest/shop-dashboard.controller';
import { ShopOrderExportController } from './api/rest/shop-order-export.controller';
import { ShopOrderController } from './api/rest/shop-order.controller';
import { OrderCancellationService } from './app/services/order-cancellation.service';
import { OrderCheckoutService } from './app/services/order-checkout.service';
import { OrderRefundService } from './app/services/order-refund.service';
import { OrderPaymentService } from './app/services/order-payment.service';
import { OrderTotalPolicyService } from './app/services/order-total-policy.service';
import { GetAdminOrderByIdUseCase } from './app/use-cases/get-admin-order-by-id/get-admin-order-by-id.use-case';
import { GetMyOrderByIdUseCase } from './app/use-cases/get-my-order-by-id/get-my-order-by-id.use-case';
import { GetShopDashboardUseCase } from './app/use-cases/get-shop-dashboard/get-shop-dashboard.use-case';
import { GetShopOrderByIdUseCase } from './app/use-cases/get-shop-order-by-id/get-shop-order-by-id.use-case';
import { HandleStripeWebhookUseCase } from './app/use-cases/handle-stripe-webhook/handle-stripe-webhook.use-case';
import { ListAdminOrdersUseCase } from './app/use-cases/list-admin-orders/list-admin-orders.use-case';
import { ExportShopOrdersUseCase } from './app/use-cases/export-shop-orders/export-shop-orders.use-case';
import { StartShopOrderExportUseCase } from './app/use-cases/start-shop-order-export/start-shop-order-export.use-case';
import { GetShopOrderExportUseCase } from './app/use-cases/get-shop-order-export/get-shop-order-export.use-case';
import { DownloadShopOrderExportUseCase } from './app/use-cases/download-shop-order-export/download-shop-order-export.use-case';
import { ListOrdersUseCase } from './app/use-cases/list-orders/list-orders.use-case';
import { ListShopOrdersUseCase } from './app/use-cases/list-shop-orders/list-shop-orders.use-case';
import { RequestOrderCancelUseCase } from './app/use-cases/request-order-cancel/request-order-cancel.use-case';
import { RequestOrderSupportUseCase } from './app/use-cases/request-order-support/request-order-support.use-case';
import { UpdateAdminOrderStatusUseCase } from './app/use-cases/update-admin-order-status/update-admin-order-status.use-case';
import { UpdateAdminOrderRefundUseCase } from './app/use-cases/update-admin-order-refund/update-admin-order-refund.use-case';
import { UpdateAdminOrderSupportNoteUseCase } from './app/use-cases/update-admin-order-support-note/update-admin-order-support-note.use-case';
import { OrderCheckoutOutboxService } from './app/services/order-checkout-outbox.service';
import { OrderEventsService } from './app/services/order-events.service';
import { OrderCartCleanupRepository } from './app/ports/order-cart-cleanup.repository';
import { OrderCheckoutSessionRepository } from './app/ports/order-checkout-session.repository';
import { OrderInventoryEventPublisher } from './app/ports/order-inventory-event.publisher';
import { OrderInventoryQueryRepository } from './app/ports/order-inventory-query.repository';
import { OrderRefundQueryRepository } from './app/ports/order-refund-query.repository';
import { OrderShopQueryRepository } from './app/ports/order-shop-query.repository';
import { OrderInventoryOutboxPublisherService } from './app/services/order-inventory-outbox-publisher.service';
import { OrderInventoryOutboxService } from './app/services/order-inventory-outbox.service';
import { ShopDashboardQueryRepository } from './app/ports/shop-dashboard-query.repository';
import { ShopOrderExportQueryRepository } from './app/ports/shop-order-export-query.repository';
import { ShopOrderExportRepository } from './app/ports/shop-order-export.repository';
import { OrderEventEntity } from './infra/persistence/entities/order-event.entity';
import { OutboxEventEntity } from './infra/persistence/entities/outbox-event.entity';
import { OrderEntity } from './infra/persistence/entities/order.entity';
import { OrderExportEntity } from './infra/persistence/entities/order-export.entity';
import { OrderItemEntity } from './infra/persistence/entities/order-item.entity';
import { MikroOrmShopDashboardQueryRepository } from './infra/persistence/repositories/mikro-orm-shop-dashboard-query.repository';
import { MikroOrmOrderCartCleanupRepository } from './infra/persistence/repositories/mikro-orm-order-cart-cleanup.repository';
import { MikroOrmOrderCheckoutSessionRepository } from './infra/persistence/repositories/mikro-orm-order-checkout-session.repository';
import { MikroOrmOrderInventoryQueryRepository } from './infra/persistence/repositories/mikro-orm-order-inventory-query.repository';
import { MikroOrmOrderRefundQueryRepository } from './infra/persistence/repositories/mikro-orm-order-refund-query.repository';
import { MikroOrmOrderShopQueryRepository } from './infra/persistence/repositories/mikro-orm-order-shop-query.repository';
import { MikroOrmShopOrderExportQueryRepository } from './infra/persistence/repositories/mikro-orm-shop-order-export-query.repository';
import { MikroOrmShopOrderExportRepository } from './infra/persistence/repositories/mikro-orm-shop-order-export.repository';
import {
  AMQP_CONNECT,
  RabbitMqOrderInventoryEventPublisher,
} from './infra/messaging/rabbitmq-order-inventory-event.publisher';
import { connect } from 'amqplib';
import { CheckoutModule } from '../checkout/checkout.module';
import { PaymentModule } from '~/integrations/payment/payment.module';
import { NotificationModule } from '~/domains/notification/notification.module';
import { QueueModule } from '~/integrations/queue/queue.module';
import { SseModule } from '~/platform/sse/sse.module';
import { StorageModule } from '~/integrations/storage/storage.module';
import { ShopModule } from '../shop/shop.module';
import { ProductModule } from '../product/product.module';
import { ForwardOrderUpdatedToSseListener } from './listeners/forward-order-updated-to-sse.listener';
import { ForwardOrderExportToSseListener } from './listeners/forward-order-export-to-sse.listener';
import { UpdateShopOrderShipmentUseCase } from './app/use-cases/update-shop-order-shipment/update-shop-order-shipment.use-case';
import { UpdateShopOrderStatusUseCase } from './app/use-cases/update-shop-order-status/update-shop-order-status.use-case';
import { UpdateShopOrderRefundUseCase } from './app/use-cases/update-shop-order-refund/update-shop-order-refund.use-case';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AuthModule),
    forwardRef(() => CheckoutModule),
    CouponModule,
    ProductModule,
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
      OrderExportEntity,
      OrderItemEntity,
      CouponUsageEntity,
    ]),
  ],
  controllers: [
    AdminOrderController,
    MeOrderController,
    OrderWebhookController,
    ShopDashboardController,
    ShopOrderExportController,
    ShopOrderController,
  ],
  providers: [
    {
      provide: RABBITMQ_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildRabbitMqConfig(configService),
    },
    {
      provide: ShopDashboardQueryRepository,
      useClass: MikroOrmShopDashboardQueryRepository,
    },
    {
      provide: ShopOrderExportQueryRepository,
      useClass: MikroOrmShopOrderExportQueryRepository,
    },
    {
      provide: ShopOrderExportRepository,
      useClass: MikroOrmShopOrderExportRepository,
    },
    {
      provide: OrderCheckoutSessionRepository,
      useClass: MikroOrmOrderCheckoutSessionRepository,
    },
    {
      provide: OrderCartCleanupRepository,
      useClass: MikroOrmOrderCartCleanupRepository,
    },
    {
      provide: OrderInventoryQueryRepository,
      useClass: MikroOrmOrderInventoryQueryRepository,
    },
    {
      provide: OrderRefundQueryRepository,
      useClass: MikroOrmOrderRefundQueryRepository,
    },
    {
      provide: OrderShopQueryRepository,
      useClass: MikroOrmOrderShopQueryRepository,
    },
    OrderCheckoutService,
    OrderTotalPolicyService,
    OrderCancellationService,
    OrderRefundService,
    OrderCheckoutOutboxService,
    OrderInventoryOutboxService,
    OrderInventoryOutboxPublisherService,
    {
      provide: AMQP_CONNECT,
      useValue: connect,
    },
    {
      provide: OrderInventoryEventPublisher,
      useClass: RabbitMqOrderInventoryEventPublisher,
    },
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
    ExportShopOrdersUseCase,
    StartShopOrderExportUseCase,
    GetShopOrderExportUseCase,
    DownloadShopOrderExportUseCase,
    GetShopDashboardUseCase,
    GetShopOrderByIdUseCase,
    UpdateAdminOrderStatusUseCase,
    UpdateAdminOrderRefundUseCase,
    UpdateAdminOrderSupportNoteUseCase,
    UpdateShopOrderStatusUseCase,
    UpdateShopOrderShipmentUseCase,
    UpdateShopOrderRefundUseCase,
    ForwardOrderUpdatedToSseListener,
    ForwardOrderExportToSseListener,
    ProcessOrderRefundJob,
    ProcessShopOrderExportJob,
  ],
  exports: [
    OrderCheckoutService,
    OrderPaymentService,
    OrderTotalPolicyService,
    OrderCheckoutOutboxService,
    OrderInventoryOutboxService,
    OrderInventoryOutboxPublisherService,
    OrderRefundService,
    ProcessOrderRefundJob,
    ProcessShopOrderExportJob,
    ShopOrderExportQueryRepository,
    ShopOrderExportRepository,
  ],
})
export class OrderModule {}
