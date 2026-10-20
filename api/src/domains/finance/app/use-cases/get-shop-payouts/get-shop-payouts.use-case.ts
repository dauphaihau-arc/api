import { Injectable } from '@nestjs/common';
import { PayoutQueryRepository } from '../../ports/payout-query.repository';
import type { PayoutRecord } from '../../ports/payout.types';

export interface GetShopPayoutsInput {
  shopId: string;
}

/**
 * Reads a shop's Payout history, newest first: what was sent, in which currency,
 * when, and how it ended. A shop that has never been paid reads as an empty
 * history rather than as an error.
 */
@Injectable()
export class GetShopPayoutsUseCase {
  constructor(private readonly payoutQueryRepository: PayoutQueryRepository) {}

  async execute(input: GetShopPayoutsInput): Promise<PayoutRecord[]> {
    return this.payoutQueryRepository.findByShopId(input.shopId);
  }
}
