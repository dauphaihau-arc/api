import { Injectable } from '@nestjs/common';
import { ShipmentStatus } from '../../../domain/enums/shipment-status.enum';
import { ShipmentUpdateActorType } from '../../../domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '../../../domain/enums/shipment-update-source.enum';
import { FulfillmentCommandRunner } from '../../services/fulfillment-command.runner';
import { FulfillmentService } from '../../services/fulfillment.service';

export type UpdateShipmentJourneyCommand = {
  status: ShipmentStatus;
  carrier?: string;
  trackingNumber?: string;
  note?: string;
};

@Injectable()
export class UpdateShipmentJourneyUseCase {
  constructor(
    private readonly commandRunner: FulfillmentCommandRunner,
    private readonly fulfillmentService: FulfillmentService,
  ) {}

  async execute(
    shopId: string,
    orderId: string,
    shipmentId: string,
    actorId: string,
    input: UpdateShipmentJourneyCommand,
  ) {
    return this.commandRunner.execute(shopId, orderId, async (context, entityManager) => {
      await this.fulfillmentService.recordJourney(entityManager, {
        orderId: context.id,
        shopId: context.shopId,
        shipmentId,
        status: input.status,
        carrier: input.carrier,
        trackingNumber: input.trackingNumber,
        note: input.note,
        actor: {
          actorType: ShipmentUpdateActorType.SELLER,
          actorId,
          source: ShipmentUpdateSource.SELLER,
        },
      });
    });
  }
}
