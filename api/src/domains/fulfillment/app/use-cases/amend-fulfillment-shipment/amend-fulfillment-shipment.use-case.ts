import { Injectable } from '@nestjs/common';
import { ShipmentUpdateActorType } from '../../../domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '../../../domain/enums/shipment-update-source.enum';
import { FulfillmentCommandRunner } from '../../services/fulfillment-command.runner';
import { FulfillmentService } from '../../services/fulfillment.service';

export type AmendFulfillmentShipmentCommand = {
  items?: Array<{ orderItemId: string; quantity: number }>;
  carrier?: string;
  trackingNumber?: string;
  note?: string;
};

@Injectable()
export class AmendFulfillmentShipmentUseCase {
  constructor(
    private readonly commandRunner: FulfillmentCommandRunner,
    private readonly fulfillmentService: FulfillmentService,
  ) {}

  async execute(
    shopId: string,
    orderId: string,
    shipmentId: string,
    actorId: string,
    input: AmendFulfillmentShipmentCommand,
  ) {
    return this.commandRunner.execute(shopId, orderId, async (context, entityManager) => {
      await this.fulfillmentService.amendShipment(entityManager, {
        orderId: context.id,
        shopId: context.shopId,
        shipmentId,
        items: input.items,
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
