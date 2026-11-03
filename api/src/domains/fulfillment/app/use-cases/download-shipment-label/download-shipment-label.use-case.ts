import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { ShipmentLabelEntity } from '../../../infra/persistence/entities/shipment-label.entity';
import { ShipmentLabelNotFoundError } from '../../errors/fulfillment-app.error';

export interface DownloadShipmentLabelResult {
  filename: string;
  body: Buffer;
}

/**
 * Streams the PDF bought for a Shipment. The label is resolved by Shipment,
 * Order, and Shop together, so a seller can never read another shop's label
 * even if it guesses the shipment public id.
 */
@Injectable()
export class DownloadShipmentLabelUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
  ) {}

  async execute(
    shopId: string,
    orderId: string,
    shipmentId: string,
  ): Promise<DownloadShipmentLabelResult> {
    const label = await this.entityManager.fork()
      .getRepository(ShipmentLabelEntity)
      .findOne({ shopId, orderId, shipment: shipmentId });

    if (!label) {
      throw new ShipmentLabelNotFoundError();
    }

    return {
      filename: 'label.pdf',
      body: await this.storageService.getObject(label.pdfStorageKey),
    };
  }
}
