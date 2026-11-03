import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheModule } from '~/integrations/cache/cache.module';
import { StorageModule } from '~/integrations/storage/storage.module';
import { IdempotencyModule } from '~/platform/idempotency/idempotency.module';
import { OutboxEventEntity } from '~/platform/outbox/outbox-event.entity';
import { AuthModule } from '../auth/auth.module';
import { OrderModule } from '../order/order.module';
import { FinanceModule } from '../finance/finance.module';
import { ShopModule } from '../shop/shop.module';
import { FulfillmentCommandRunner } from './app/services/fulfillment-command.runner';
import { FulfillmentTargetResolver } from './app/services/fulfillment-target-resolver.service';
import { FulfillmentService } from './app/services/fulfillment.service';
import { LabelMoneyEventOutboxService } from './app/services/label-money-event-outbox.service';
import { OrderDeliveredOutboxService } from './app/services/order-delivered-outbox.service';
import { AmendFulfillmentShipmentUseCase } from './app/use-cases/amend-fulfillment-shipment/amend-fulfillment-shipment.use-case';
import { DeclareFulfillmentHandoverUseCase } from './app/use-cases/declare-fulfillment-handover/declare-fulfillment-handover.use-case';
import { DownloadShipmentLabelUseCase } from './app/use-cases/download-shipment-label/download-shipment-label.use-case';
import { PrepareFulfillmentShipmentUseCase } from './app/use-cases/prepare-fulfillment-shipment/prepare-fulfillment-shipment.use-case';
import { PurchaseFulfillmentLabelUseCase } from './app/use-cases/purchase-fulfillment-label/purchase-fulfillment-label.use-case';
import { QuoteShipmentRatesUseCase } from './app/use-cases/quote-shipment-rates/quote-shipment-rates.use-case';
import { ReconcileOrderFulfillmentUseCase } from './app/use-cases/reconcile-order-fulfillment/reconcile-order-fulfillment.use-case';
import { RefundShipmentLabelUseCase } from './app/use-cases/refund-shipment-label/refund-shipment-label.use-case';
import { RecordCarrierEventUseCase } from './app/use-cases/record-carrier-event/record-carrier-event.use-case';
import { VoidFulfillmentShipmentUseCase } from './app/use-cases/void-fulfillment-shipment/void-fulfillment-shipment.use-case';
import { CarrierParcelGateway } from '~/integrations/carrier/app/ports/carrier-parcel.gateway';
import { OrderFulfillmentContextPort } from './app/ports/order-fulfillment-context.port';
import { OrderFulfillmentViewPort } from './app/ports/order-fulfillment-view.port';
import { ShipmentPublicIdLookup } from './app/services/shipment-public-id-lookup.service';
import { ShopOrderFulfillmentController } from './api/rest/shop-order-fulfillment.controller';
import { CarriersController } from './api/rest/carriers.controller';
import { CarrierWebhookController } from './api/rest/carrier-webhook.controller';
import { ShipmentQueryRepository } from './app/ports/shipment-query.repository';
import { FulfillmentGroupEntity } from './infra/persistence/entities/fulfillment-group.entity';
import { FulfillmentGroupItemEntity } from './infra/persistence/entities/fulfillment-group-item.entity';
import { ShipmentEntity } from './infra/persistence/entities/shipment.entity';
import { ShipmentItemEntity } from './infra/persistence/entities/shipment-item.entity';
import { ShipmentLabelEntity } from './infra/persistence/entities/shipment-label.entity';
import { ShipmentUpdateEntity } from './infra/persistence/entities/shipment-update.entity';
import { MikroOrmOrderFulfillmentContextAdapter } from './infra/persistence/repositories/mikro-orm-order-fulfillment-context.adapter';
import { MikroOrmOrderFulfillmentViewAdapter } from './infra/persistence/repositories/mikro-orm-order-fulfillment-view.adapter';
import { MikroOrmShipmentQueryRepository } from './infra/persistence/repositories/mikro-orm-shipment-query.repository';
import { MockCarrierParcelGateway } from '~/integrations/carrier/infra/mock-carrier-parcel.gateway';

@Module({
  imports: [
    ShopModule,
    AuthModule,
    forwardRef(() => OrderModule),
    CacheModule,
    IdempotencyModule,
    StorageModule,
    // Imported via forwardRef: Finance resolves an Order public id through
    // Ordering, and Ordering reaches Fulfillment, so this edge closes a cycle.
    forwardRef(() => FinanceModule),
    MikroOrmModule.forFeature([
      FulfillmentGroupEntity,
      FulfillmentGroupItemEntity,
      ShipmentEntity,
      ShipmentItemEntity,
      ShipmentLabelEntity,
      ShipmentUpdateEntity,
      OutboxEventEntity,
    ]),
  ],
  controllers: [
    ShopOrderFulfillmentController,
    CarriersController,
    CarrierWebhookController,
  ],
  providers: [
    FulfillmentService,
    FulfillmentCommandRunner,
    OrderDeliveredOutboxService,
    LabelMoneyEventOutboxService,
    PrepareFulfillmentShipmentUseCase,
    PurchaseFulfillmentLabelUseCase,
    DownloadShipmentLabelUseCase,
    QuoteShipmentRatesUseCase,
    AmendFulfillmentShipmentUseCase,
    VoidFulfillmentShipmentUseCase,
    RefundShipmentLabelUseCase,
    DeclareFulfillmentHandoverUseCase,
    ReconcileOrderFulfillmentUseCase,
    RecordCarrierEventUseCase,
    ShipmentPublicIdLookup,
    FulfillmentTargetResolver,
    {
      provide: CarrierParcelGateway,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new MockCarrierParcelGateway({
          baseUrl: configService.get<string>('MOCK_CARRIER_URL'),
        }),
    },
    {
      provide: OrderFulfillmentContextPort,
      useClass: MikroOrmOrderFulfillmentContextAdapter,
    },
    {
      provide: OrderFulfillmentViewPort,
      useClass: MikroOrmOrderFulfillmentViewAdapter,
    },

    {
      provide: ShipmentQueryRepository,
      useClass: MikroOrmShipmentQueryRepository,
    },
  ],
  exports: [FulfillmentService, OrderFulfillmentViewPort],
})
export class FulfillmentModule {}
