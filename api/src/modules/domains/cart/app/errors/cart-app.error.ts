import { DomainError } from '~/common/errors/domain.error';

export abstract class CartAppError extends DomainError {
  protected constructor(message: string) {
    super(message);
  }
}

export class CartNotFoundError extends CartAppError {
  constructor() {
    super('Cart was not found');
  }
}

export class CartItemNotFoundError extends CartAppError {
  constructor() {
    super('Cart item was not found');
  }
}

export class ProductInventoryNotFoundError extends CartAppError {
  constructor(inventoryId: string) {
    super(`Product inventory "${inventoryId}" was not found`);
  }
}

export class ProductUnavailableForCartError extends CartAppError {
  constructor() {
    super('Product is not available for cart operations');
  }
}

export class CartQuantityExceedsStockError extends CartAppError {
  constructor() {
    super('Quantity of product exceeds stock');
  }
}
