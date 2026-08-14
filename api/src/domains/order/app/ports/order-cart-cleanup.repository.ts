import type { OrderRepositoryContext } from './order-repository-context';

export interface ClearCheckoutCartInput {
  cartId: string;
  isTempCart: boolean;
  inventoryIds?: string[];
}

export abstract class OrderCartCleanupRepository {
  abstract clearCheckoutCart(
    input: ClearCheckoutCartInput,
    context?: OrderRepositoryContext
  ): Promise<void>;
}
