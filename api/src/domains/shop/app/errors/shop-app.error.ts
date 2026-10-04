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

/** The shop's scheduling timezone is not a recognized IANA zone. */
export class ShopTimeZoneInvalidError extends ShopAppError {
  constructor(timezone: string) {
    super(`"${timezone}" is not a recognized IANA timezone`);
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

export class SaleNotFoundError extends ShopAppError {
  constructor() {
    super('Sale not found');
  }
}

/**
 * The Sale's lifecycle state does not admit the requested irreversible stop.
 * A scheduled Sale can only be cancelled and an active Sale can only be ended;
 * a Sale that already reached either state is final.
 */
export class SaleStopNotAllowedError extends ShopAppError {
  constructor(action: 'cancel' | 'end', status: string) {
    super(action === 'cancel'
      ? `Only a scheduled sale can be cancelled; this sale is ${status}`
      : `Only an active sale can be ended early; this sale is ${status}`);
  }
}

/** The selected Products of a Promo Code are not a valid Product Scope. */
export class PromoCodeProductScopeInvalidError extends ShopAppError {
  constructor(message: string) {
    super(message);
  }
}

/** The requested benefit is not a valid Promo Code benefit. */
export class PromoCodeBenefitInvalidError extends ShopAppError {
  constructor(message: string) {
    super(message);
  }
}

/** The requested qualifying condition is not a valid Promo Code condition. */
export class PromoCodeConditionInvalidError extends ShopAppError {
  constructor(message: string) {
    super(message);
  }
}

export class PromoCodeScheduleInvalidError extends ShopAppError {
  constructor(message: string) {
    super(message);
  }
}

export class PromoCodeTimeZoneInvalidError extends ShopAppError {
  constructor(timezone: string) {
    super(`"${timezone}" is not a recognized IANA timezone`);
  }
}

export class PromoCodeEndAfterStartRequiredError extends ShopAppError {
  constructor() {
    super('The promo code must start before it ends');
  }
}

/** A spring-forward local time that never exists on the calendar. */
export class PromoCodeLocalTimeNonexistentError extends ShopAppError {
  constructor(boundary: 'start' | 'end') {
    super(`The promo code ${boundary} is a local time that does not exist in the selected timezone`);
  }
}

/** A fall-back local time that occurs twice and needs explicit disambiguation. */
export class PromoCodeLocalTimeAmbiguousError extends ShopAppError {
  constructor(boundary: 'start' | 'end') {
    super(`The promo code ${boundary} occurs twice in the selected timezone; choose which occurrence to use`);
  }
}

/**
 * A code collides case-insensitively with an existing Promo Code in the same
 * shop. Codes may repeat across shops, but are never reassigned after ending.
 */
export class PromoCodeAlreadyExistsError extends ShopAppError {
  constructor() {
    super('Promo code already exists');
  }
}

export class PromoCodeNotFoundError extends ShopAppError {
  constructor() {
    super('Promo code not found');
  }
}

/**
 * The Promo Code's lifecycle state does not admit the requested irreversible
 * stop. A scheduled Promo Code can only be cancelled and an active one only
 * ended; one that already reached either state is final.
 */
export class PromoCodeStopNotAllowedError extends ShopAppError {
  constructor(action: 'cancel' | 'end', status: string) {
    super(action === 'cancel'
      ? `Only a scheduled promo code can be cancelled; this promo code is ${status}`
      : `Only an active promo code can be ended early; this promo code is ${status}`);
  }
}
