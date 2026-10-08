import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { PromotionRepository } from '../../../app/ports/promotion.repository';
import { PromotionEntity } from '../entities/promotion.entity';

@Injectable()
export class MikroOrmPromotionRepository implements PromotionRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findByPublicId(publicId: string): Promise<{ id: string } | null> {
    const promotion = await this.entityManager
      .fork()
      .getRepository(PromotionEntity)
      .findOne({ publicId }, { fields: ['id'] });

    return promotion ? { id: promotion.id } : null;
  }

  async findByPublicIds(publicIds: readonly string[]): Promise<readonly ({ id: string } | null)[]> {
    if (!publicIds.length) return [];
    const promotions = await this.entityManager.fork().getRepository(PromotionEntity).find(
      { publicId: { $in: [...new Set(publicIds)] } },
      { fields: ['id', 'publicId'] },
    );
    const byPublicId = new Map(promotions.map((promotion) => [promotion.publicId, promotion.id]));
    return publicIds.map((publicId) => {
      const id = byPublicId.get(publicId);
      return id ? { id } : null;
    });
  }
}
