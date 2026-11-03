import { Injectable } from '@nestjs/common';
import { isObservableCarrier } from '../../../domain/carrier-catalogue';
import { ShipmentUpdateActorType } from '../../../domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '../../../domain/enums/shipment-update-source.enum';
import { CarrierParcelGateway, type CarrierParcelIdentity } from '~/integrations/carrier/app/ports/carrier-parcel.gateway';
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
    private readonly carrierParcelGateway: CarrierParcelGateway,
  ) {}

  async execute(
    shopId: string,
    orderId: string,
    shipmentId: string,
    actorId: string,
  ) {
    // Captured inside the transaction, forwarded only once it has committed.
    // Replays are safe: the carrier service treats a repeat handover as a no-op.
    let handedOver: CarrierParcelIdentity | undefined;

    const result = await this.commandRunner.execute(
      shopId,
      orderId,
      async (context, entityManager) => {
        const shipment = await this.fulfillmentService.declareHandover(entityManager, {
          orderId: context.id,
          shopId: context.shopId,
          shipmentId,
          actor: {
            actorType: ShipmentUpdateActorType.SELLER,
            actorId,
            source: ShipmentUpdateSource.SELLER,
          },
        });

        if (shipment.carrier && shipment.trackingNumber && isObservableCarrier(shipment.carrier)) {
          handedOver = {
            carrier: shipment.carrier,
            trackingNumber: shipment.trackingNumber,
          };
        }
      },
    );

    if (handedOver) {
      await this.carrierParcelGateway.signalHandover(handedOver);
    }

    return result;
  }
}
