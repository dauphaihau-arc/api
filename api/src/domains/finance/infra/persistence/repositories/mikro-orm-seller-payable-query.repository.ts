import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import {
  SellerPayableQueryRepository,
  type SellerPayablePosition,
} from '../../../app/ports/seller-payable-query.repository';
import { SellerPayablePositionEntity } from '../entities/seller-payable-position.entity';

@Injectable()
export class MikroOrmSellerPayableQueryRepository
implements SellerPayableQueryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async listByShopId(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<SellerPayablePosition[]> {
    const positions = await this.getEntityManager(context)
      .getRepository(SellerPayablePositionEntity)
      .find({ shop: shopId }, { orderBy: { currency: 'asc' } });

    return positions.map((position) => ({
      shopId: position.shop.id,
      currency: position.currency,
      availableMinor: position.availableMinor,
      notYetAvailableMinor: position.notYetAvailableMinor,
    }));
  }

  private getEntityManager(context?: FinanceRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
