import { Injectable } from '@nestjs/common';
import { ShipmentUpdateActorType } from '../../../domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '../../../domain/enums/shipment-update-source.enum';
import { FulfillmentCommandRunner } from '../../services/fulfillment-command.runner';
import { FulfillmentService } from '../../services/fulfillment.service';

export type PrepareFulfillmentShipmentCommand = {
  groupId?: string;
  items?: Array<{ orderItemId: string; quantity: number }>;
  carrier?: string;
  trackingNumber?: string;
  note?: string;
};

@Injectable()
export class PrepareFulfillmentShipmentUseCase {
  constructor(
    private readonly commandRunner: FulfillmentCommandRunner,
    private readonly fulfillmentService: FulfillmentService,
  ) {}

  async execute(
    shopId: string,
    orderId: string,
    actorId: string,
    input: PrepareFulfillmentShipmentCommand,
  ) {
    return this.commandRunner.execute(shopId, orderId, async (context, entityManager) => {
      await this.fulfillmentService.prepareShipment(entityManager, {
        orderId: context.id,
        shopId: context.shopId,
        groupId: input.groupId,
        items: input.items,
        carrier: input.carrier,
        trackingNumber: input.trackingNumber,
        note: input.note,
        originCountries: context.originCountries,
        actor: {
          actorType: ShipmentUpdateActorType.SELLER,
          actorId,
          source: ShipmentUpdateSource.SELLER,
        },
      });
    });
  }
}
