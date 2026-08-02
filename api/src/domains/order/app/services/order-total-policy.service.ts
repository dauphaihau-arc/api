import { Inject, Injectable } from '@nestjs/common';
import {
  CHECKOUT_CONFIG,
  getMaxOrderTotalMinor,
  type CheckoutConfig,
} from '../../../../platform/config/checkout.config';
import { OrderTotalLimitExceededError } from '../errors/order-app.error';

@Injectable()
export class OrderTotalPolicyService {
  constructor(
    @Inject(CHECKOUT_CONFIG)
    private readonly checkoutConfig: CheckoutConfig,
  ) {}

  assertWithinLimit(input: {
    totalMinor: number;
    currency: string;
  }): void {
    const maxTotalMinor = getMaxOrderTotalMinor(
      this.checkoutConfig,
      input.currency,
    );

    if (maxTotalMinor == null) {
      return;
    }

    if (input.totalMinor > maxTotalMinor) {
      throw new OrderTotalLimitExceededError(input.currency);
    }
  }
}
