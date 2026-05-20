import { DomainError } from '~/common/errors/domain.error';

export abstract class ShopAppError extends DomainError {
  protected constructor(message: string) {
    super(message);
  }
}

export class ShopNameAlreadyTakenError extends ShopAppError {
  constructor() {
    super('Shop name is already taken');
  }
}

export class ShopSlugAlreadyTakenError extends ShopAppError {
  constructor() {
    super('Shop slug is already taken');
  }
}

export class ShopSlugReservedError extends ShopAppError {
  constructor(slug: string) {
    super(`Shop slug "${slug}" is reserved`);
  }
}

export class UserAlreadyOwnsShopError extends ShopAppError {
  constructor() {
    super('Each account can only own one shop');
  }
}
