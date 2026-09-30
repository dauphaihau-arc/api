import { DomainError } from '~/platform/errors/domain.error';

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

export class ShopNotFoundError extends ShopAppError {
  constructor() {
    super('Shop not found');
  }
}

export class ShopAccessDeniedError extends ShopAppError {
  constructor() {
    super('You do not own this shop');
  }
}

export class CouponNotFoundError extends ShopAppError {
  constructor() {
    super('Coupon not found');
  }
}

export class CouponCodeAlreadyExistsError extends ShopAppError {
  constructor() {
    super('Coupon code already exists');
  }
}

export class InvalidCouponWindowError extends ShopAppError {
  constructor() {
    super('endDate must be after startDate');
  }
}

export class CouponUsageLimitsInvalidError extends ShopAppError {
  constructor() {
    super('maxUsesPerUser must be less than or equal to maxUses');
  }
}

/**
 * The selected Products of a Sale are not a valid Product Scope: a target does
 * not exist, belongs to another shop, or is listed twice.
 */
export class SaleProductScopeInvalidError extends ShopAppError {
  constructor(message: string) {
    super(message);
  }
}

export class SaleScheduleInvalidError extends ShopAppError {
  constructor(message: string) {
    super(message);
  }
}

export class SaleTimeZoneInvalidError extends ShopAppError {
  constructor(timezone: string) {
    super(`"${timezone}" is not a recognized IANA timezone`);
  }
}

export class SaleEndAfterStartRequiredError extends ShopAppError {
  constructor() {
    super('The sale must start before it ends');
  }
}

/** A spring-forward local time that never exists on the calendar. */
export class SaleLocalTimeNonexistentError extends ShopAppError {
  constructor(boundary: 'start' | 'end') {
    super(`The sale ${boundary} is a local time that does not exist in the selected timezone`);
  }
}

/** A fall-back local time that occurs twice and needs explicit disambiguation. */
export class SaleLocalTimeAmbiguousError extends ShopAppError {
  constructor(boundary: 'start' | 'end') {
    super(`The sale ${boundary} occurs twice in the selected timezone; choose which occurrence to use`);
  }
}
