import { Injectable } from '@nestjs/common';
import { isObservableCarrier } from '../../../domain/carrier-catalogue';
import { ShipmentUpdateActorType } from '../../../domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '../../../domain/enums/shipment-update-source.enum';
import { CarrierParcelGateway, type CarrierParcelIdentity } from '~/integrations/carrier/app/ports/carrier-parcel.gateway';
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
    private readonly carrierParcelGateway: CarrierParcelGateway,
  ) {}

  async execute(
    shopId: string,
    orderId: string,
    actorId: string,
    input: PrepareFulfillmentShipmentCommand,
  ) {
    // Captured inside the transaction, forwarded only once it has committed.
    let prepared: CarrierParcelIdentity | undefined;

    const result = await this.commandRunner.execute(
      shopId,
      orderId,
      async (context, entityManager) => {
        const shipment = await this.fulfillmentService.prepareShipment(entityManager, {
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

        if (shipment.carrier && shipment.trackingNumber && isObservableCarrier(shipment.carrier)) {
          prepared = {
            carrier: shipment.carrier,
            trackingNumber: shipment.trackingNumber,
          };
        }
      },
    );

    if (prepared) {
      await this.carrierParcelGateway.registerParcel(prepared);
    }

    return result;
  }
}
