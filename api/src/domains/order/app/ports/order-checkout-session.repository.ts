import type { OrderEntity } from '../../infra/persistence/entities/order.entity';
import type { OrderRepositoryContext } from './order-repository-context';

export abstract class OrderCheckoutSessionRepository {
  abstract findOrdersByCheckoutSession(
    sessionId: string,
    context?: OrderRepositoryContext
  ): Promise<OrderEntity[]>;
}
