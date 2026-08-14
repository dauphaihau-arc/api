import type { ShopEntity } from '../../../shop/infra/persistence/entities/shop.entity';
import type { OrderRepositoryContext } from './order-repository-context';

export abstract class OrderShopQueryRepository {
  abstract findByIdWithOwner(
    shopId: string,
    context?: OrderRepositoryContext
  ): Promise<ShopEntity | null>;
}
