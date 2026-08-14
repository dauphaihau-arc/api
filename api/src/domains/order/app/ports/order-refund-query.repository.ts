import type { OrderEntity } from '../../infra/persistence/entities/order.entity';
import type { OrderRepositoryContext } from './order-repository-context';

export abstract class OrderRefundQueryRepository {
  abstract findById(
    orderId: string,
    context?: OrderRepositoryContext
  ): Promise<OrderEntity | null>;

  abstract findByIdWithShopOwner(
    orderId: string,
    context?: OrderRepositoryContext
  ): Promise<OrderEntity | null>;
}
