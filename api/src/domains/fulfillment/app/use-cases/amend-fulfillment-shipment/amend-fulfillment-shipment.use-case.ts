import { Injectable } from '@nestjs/common';
import { CarrierParcelGateway, type CarrierParcelIdentity } from '~/integrations/carrier/app/ports/carrier-parcel.gateway';
import { isObservableCarrier } from '../../../domain/carrier-catalogue';
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
    private readonly carrierParcelGateway: CarrierParcelGateway,
  ) {}

  async execute(
    shopId: string,
    orderId: string,
    shipmentId: string,
    actorId: string,
    input: AmendFulfillmentShipmentCommand,
  ) {
    // A corrected tracking number must reach the carrier too, or a later
    // handover signal would name a parcel the carrier never registered.
    let amended: CarrierParcelIdentity | undefined;

    const result = await this.commandRunner.execute(
      shopId,
      orderId,
      async (context, entityManager) => {
        const shipment = await this.fulfillmentService.amendShipment(entityManager, {
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

        if (shipment.carrier && shipment.trackingNumber && isObservableCarrier(shipment.carrier)) {
          amended = {
            carrier: shipment.carrier,
            trackingNumber: shipment.trackingNumber,
          };
        }
      },
    );

    if (amended) {
      await this.carrierParcelGateway.registerParcel(amended);
    }

    return result;
  }
}
