import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { CacheModule } from '~/integrations/cache/cache.module';
import { IdempotencyModule } from '~/platform/idempotency/idempotency.module';
import { ShopModule } from '../shop/shop.module';
import { FulfillmentCommandRunner } from './app/services/fulfillment-command.runner';
import { FulfillmentService } from './app/services/fulfillment.service';
import { AmendFulfillmentShipmentUseCase } from './app/use-cases/amend-fulfillment-shipment/amend-fulfillment-shipment.use-case';
import { PrepareFulfillmentShipmentUseCase } from './app/use-cases/prepare-fulfillment-shipment/prepare-fulfillment-shipment.use-case';
import { ReconcileOrderFulfillmentUseCase } from './app/use-cases/reconcile-order-fulfillment/reconcile-order-fulfillment.use-case';
import { UpdateShipmentJourneyUseCase } from './app/use-cases/update-shipment-journey/update-shipment-journey.use-case';
import { VoidFulfillmentShipmentUseCase } from './app/use-cases/void-fulfillment-shipment/void-fulfillment-shipment.use-case';
import { OrderFulfillmentContextPort } from './app/ports/order-fulfillment-context.port';
import { OrderFulfillmentViewPort } from './app/ports/order-fulfillment-view.port';
import { ShopOrderFulfillmentController } from './api/rest/shop-order-fulfillment.controller';
import { FulfillmentGroupEntity } from './infra/persistence/entities/fulfillment-group.entity';
import { FulfillmentGroupItemEntity } from './infra/persistence/entities/fulfillment-group-item.entity';
import { ShipmentEntity } from './infra/persistence/entities/shipment.entity';
import { ShipmentItemEntity } from './infra/persistence/entities/shipment-item.entity';
import { ShipmentUpdateEntity } from './infra/persistence/entities/shipment-update.entity';
import { MikroOrmOrderFulfillmentContextAdapter } from './infra/persistence/repositories/mikro-orm-order-fulfillment-context.adapter';
import { MikroOrmOrderFulfillmentViewAdapter } from './infra/persistence/repositories/mikro-orm-order-fulfillment-view.adapter';

@Module({
  imports: [
    ShopModule,
    CacheModule,
    IdempotencyModule,
    MikroOrmModule.forFeature([
      FulfillmentGroupEntity,
      FulfillmentGroupItemEntity,
      ShipmentEntity,
      ShipmentItemEntity,
      ShipmentUpdateEntity,
    ]),
  ],
  controllers: [ShopOrderFulfillmentController],
  providers: [
    FulfillmentService,
    FulfillmentCommandRunner,
    PrepareFulfillmentShipmentUseCase,
    AmendFulfillmentShipmentUseCase,
    VoidFulfillmentShipmentUseCase,
    UpdateShipmentJourneyUseCase,
    ReconcileOrderFulfillmentUseCase,
    {
      provide: OrderFulfillmentContextPort,
      useClass: MikroOrmOrderFulfillmentContextAdapter,
    },
    {
      provide: OrderFulfillmentViewPort,
      useClass: MikroOrmOrderFulfillmentViewAdapter,
    },
  ],
  exports: [FulfillmentService, OrderFulfillmentViewPort],
})
export class FulfillmentModule {}
