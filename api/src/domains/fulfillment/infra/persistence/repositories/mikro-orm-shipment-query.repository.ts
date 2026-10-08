import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ShipmentQueryRepository } from '../../../app/ports/shipment-query.repository';
import { ShipmentEntity } from '../entities/shipment.entity';

@Injectable()
export class MikroOrmShipmentQueryRepository implements ShipmentQueryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findByPublicId(publicId: string): Promise<{ id: string } | null> {
    const shipment = await this.entityManager
      .fork()
      .getRepository(ShipmentEntity)
      .findOne({ publicId }, { fields: ['id'] });

    return shipment ? { id: shipment.id } : null;
  }
}
