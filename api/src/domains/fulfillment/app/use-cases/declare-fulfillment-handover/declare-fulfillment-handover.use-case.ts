import { Injectable } from '@nestjs/common';
import { ShipmentUpdateActorType } from '../../../domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '../../../domain/enums/shipment-update-source.enum';
import { FulfillmentCommandRunner } from '../../services/fulfillment-command.runner';
import { FulfillmentService } from '../../services/fulfillment.service';

/**
 * The seller's only status authority: declaring that a prepared Shipment was
 * handed to its carrier. It records one seller-sourced dispatch update.
 */
@Injectable()
export class DeclareFulfillmentHandoverUseCase {
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
      await this.fulfillmentService.declareHandover(entityManager, {
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
