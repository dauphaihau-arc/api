import { Injectable, NotFoundException } from '@nestjs/common';
import { ShipmentQueryRepository } from '../ports/shipment-query.repository';

@Injectable()
export class ShipmentPublicIdLookup {
  constructor(private readonly shipmentQueryRepository: ShipmentQueryRepository) {}

  async resolveShipmentPublicId(publicId: string): Promise<string> {
    const shipment = await this.shipmentQueryRepository.findByPublicId(publicId);
    if (!shipment) throw new NotFoundException('Shipment was not found');
    return shipment.id;
  }
}
