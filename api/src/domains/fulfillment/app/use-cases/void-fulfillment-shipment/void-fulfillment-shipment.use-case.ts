import { Injectable } from '@nestjs/common';
import { ShipmentUpdateActorType } from '../../../domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '../../../domain/enums/shipment-update-source.enum';
import { FulfillmentCommandRunner } from '../../services/fulfillment-command.runner';
import { FulfillmentService } from '../../services/fulfillment.service';

@Injectable()
export class VoidFulfillmentShipmentUseCase {
  constructor(
    private readonly commandRunner: FulfillmentCommandRunner,
    private readonly fulfillmentService: FulfillmentService,
  ) {}

  async execute(
    shopId: string,
    orderId: string,
    shipmentId: string,
    actorId: string,
  ) {
    return this.commandRunner.execute(shopId, orderId, async (context, entityManager) => {
      await this.fulfillmentService.voidShipment(entityManager, {
        orderId: context.id,
        shopId: context.shopId,
        shipmentId,
        actor: {
          actorType: ShipmentUpdateActorType.SELLER,
          actorId,
          source: ShipmentUpdateSource.SELLER,
        },
      });
    });
  }
}
