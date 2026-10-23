import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { createPublicId } from '~/platform/ids/public-id';
import { PayoutAttemptService } from '../../services/payout-attempt.service';
import {
  PayoutAccountRepository,
  type PayoutAccountPaymentTarget,
  type PayoutAccountRecord,
} from '../../ports/payout-account.repository';
import {
  PayoutCommandRepository,
  type ClaimedPayout,
  type PayoutClaimRejection,
} from '../../ports/payout-command.repository';
import { PayoutQueryRepository } from '../../ports/payout-query.repository';
import type { PayoutRecord } from '../../ports/payout.types';
import { SellerPayableQueryRepository } from '../../ports/seller-payable-query.repository';
import {
  ManualPayoutAlreadyUsedError,
  NoPayableAmountError,
  PayoutAccountUnusableError,
  PayoutAmountExceedsAvailableError,
  PayoutPendingError,
} from '../../errors/finance-app.error';
import { PayoutAmountNotPositiveError } from '../../../domain/errors/finance-domain.error';
import {
  allocatePayoutOrders,
  netPayableMinor,
  type PayoutAllocation,
  type PayoutBlockReason,
  type PayoutSource,
} from '../../../domain/rules/payout';

/** What one shop's Payout attempt did. */
export type PayShopOutcome = 'paid' | 'retrying' | 'failed' | 'blocked' | 'skipped';

export interface PayShopInput {
  shopId: string;
  /** The shop's Settlement Currency, as the run or the withdrawal resolved it. */
  currency: string;
  /** The platform day the attempt belongs to, as `YYYY-MM-DD`. */
  runDay: string;
  source: PayoutSource;
  /** The platform month the attempt belongs to, as `YYYY-MM`. */
  periodKey: string;

  /** The seller who asked for a manual withdrawal, when there is one. */
  requestedByUserId?: string;

  /**
   * The manual amount to withdraw, in minor units. Omitted means the whole net
   * payable; a supplied amount must be a positive integer within it.
   */
  amountMinor?: number;

  /**
   * Whether this attempt uses up its source's monthly allowance. A manual
   * withdrawal repeated within the month when the flag permits it does not.
   */
  quotaConsumed: boolean;
}

export interface PayShopResult {
  outcome: PayShopOutcome;
  /** The created Payout, when one was recorded; a skip has none. */
  payout: PayoutRecord | null;
}

/** What the locked read-and-claim decision produced for one shop. */
type PayoutDecision =
  | { kind: 'skipped' }
  | { kind: 'blocked' }
  | { kind: 'rejected'; rejection: PayoutClaimRejection }
  | {
    kind: 'claimed';
    payout: ClaimedPayout;
    target: PayoutAccountPaymentTarget;
    amountMinor: number;
    allocations: PayoutAllocation[];
  };

/**
 * Pays one shop from its Available Seller Payable, shared by the automatic run
 * and a seller's manual withdrawal.
 *
 * It scans recorded Payout Availability — never the shop's balance as a whole —
 * so a not-yet-available amount can never leave. It nets a negative balance,
 * claims the shop's Payout for the platform month, sends it through the payout
 * provider port, and settles it in one transaction: the provider's reference,
 * the Orders discharged, the Journal Entry that reduces Seller Payable, and the
 * projected available figure.
 *
 * The two sources differ only in what an unusable account means and in how a
 * claim rejection is reported: a scheduled run records a Blocked fact and skips,
 * while a seller's request is refused with an error before writing anything.
 */
@Injectable()
export class PayShopUseCase {
  private readonly logger = new Logger(PayShopUseCase.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly payoutQueryRepository: PayoutQueryRepository,
    private readonly payoutCommandRepository: PayoutCommandRepository,
    private readonly payoutAccountRepository: PayoutAccountRepository,
    private readonly sellerPayableQueryRepository: SellerPayableQueryRepository,
    private readonly payoutAttemptService: PayoutAttemptService,
  ) {}

  async execute(input: PayShopInput): Promise<PayShopResult> {
    const decision = await this.entityManager.transactional(
      async (entityManager): Promise<PayoutDecision> => {
        const context = { entityManager };

        // Serialize one shop's read-and-claim decision across both payout
        // sources and unlimited manual withdrawals. The lock is transaction
        // scoped, so it is released at commit, before the provider is called.
        await entityManager.execute(
          'select pg_advisory_xact_lock(hashtext(?))',
          [input.shopId],
        );

        const balance = await this.sellerPayableQueryRepository
          .findBalanceByShopId(input.shopId, context);

        if (!balance || balance.currency !== input.currency) {
          this.logger.error(
            `Shop ${input.shopId} has Payout Availability in ${input.currency} but its Seller Payable resolves in ${balance?.currency ?? 'no currency'}`,
          );
          return { kind: 'skipped' };
        }

        const orders = await this.payoutQueryRepository.findPayableOrders(
          input.shopId,
          context,
        );

        const orderTotalMinor = orders.reduce(
          (total, order) => total + order.amountMinor,
          0,
        );

        // Netting happens before the manual amount is checked, so a seller is
        // never allowed to withdraw around a negative not-yet-available balance.
        const netPayable = Math.min(
          netPayableMinor(balance.availableMinor, balance.notYetAvailableMinor),
          orderTotalMinor,
        );

        if (input.amountMinor !== undefined) {
          if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
            throw new PayoutAmountNotPositiveError(input.amountMinor);
          }

          if (input.amountMinor > netPayable) {
            throw new PayoutAmountExceedsAvailableError(input.amountMinor, netPayable);
          }
        }

        const requestedMinor = input.amountMinor ?? netPayable;

        if (requestedMinor <= 0) {
          // A negative Seller Payable is carried forward: nothing is sent and
          // the next attempt nets the debt against whatever availability exists.
          if (input.source === 'manual') {
            throw new NoPayableAmountError(input.shopId);
          }

          return { kind: 'skipped' };
        }

        const allocations = allocatePayoutOrders(orders, requestedMinor);

        const amountMinor = allocations.reduce(
          (total, allocation) => total + allocation.amountMinor,
          0,
        );

        const account = await this.payoutAccountRepository.findActiveByShopId(
          input.shopId,
          context,
        );

        const blockReason = this.resolveBlockReason(account, input.currency);

        if (blockReason) {
          if (input.source === 'manual') {
            // A manual withdrawal is the seller's own request, so it is refused
            // rather than recorded as a Blocked Payout the seller never scheduled.
            throw new PayoutAccountUnusableError(input.shopId, blockReason);
          }

          await this.payoutCommandRepository.recordBlocked(
            {
              publicId: createPublicId('pay'),
              shopId: input.shopId,
              currency: input.currency,
              amountMinor,
              reason: blockReason,
              runDay: input.runDay,
              source: input.source,
              periodKey: input.periodKey,
            },
            context,
          );

          return { kind: 'blocked' };
        }

        const target = await this.payoutAccountRepository.findPayableByShopId(
          input.shopId,
          context,
        );

        if (!target) {
          // The account changed between the guard read and the payment target read.
          if (input.source === 'manual') {
            throw new PayoutAccountUnusableError(
              input.shopId,
              'payout_account_unverified',
            );
          }

          return { kind: 'skipped' };
        }

        // The claim is what keeps a later run in the same month, or either
        // source while an earlier transfer is still pending, from calling the
        // provider again.
        const claim = await this.payoutCommandRepository.claim(
          {
            publicId: createPublicId('pay'),
            shopId: input.shopId,
            payoutAccountId: target.id,
            currency: input.currency,
            amountMinor,
            runDay: input.runDay,
            source: input.source,
            periodKey: input.periodKey,
            requestedByUserId: input.requestedByUserId,
            quotaConsumed: input.quotaConsumed,
            allocations,
          },
          context,
        );

        if (!claim.payout) {
          return { kind: 'rejected', rejection: claim.rejection };
        }

        return {
          kind: 'claimed',
          payout: claim.payout,
          target,
          amountMinor,
          allocations,
        };
      },
    );

    if (decision.kind === 'skipped') {
      return { outcome: 'skipped', payout: null };
    }

    if (decision.kind === 'blocked') {
      return { outcome: 'blocked', payout: null };
    }

    if (decision.kind === 'rejected') {
      return this.handleClaimRejection(input, decision.rejection);
    }

    const {
      payout,
      target,
      amountMinor,
      allocations,
    } = decision;

    // One provider attempt, bounded and shared with the retry job. A failure
    // leaves the same row `pending` with a scheduled retry, so neither this
    // request nor the run waits on a provider outage.
    const outcome = await this.payoutAttemptService.attempt({
      payout: {
        id: payout.id,
        publicId: payout.publicId,
        shopId: input.shopId,
        currency: payout.currency,
        amountMinor,
        source: input.source,
      },
      target,
      allocations,
    });

    if (outcome === 'skipped') {
      return { outcome: 'skipped', payout: null };
    }

    return {
      outcome,
      payout: await this.payoutQueryRepository.findById(payout.id),
    };
  }

  /**
   * Turns a claim rejection into the caller's contract: a scheduled run skips,
   * while a manual withdrawal is refused with the reason the seller can act on.
   */
  private handleClaimRejection(
    input: PayShopInput,
    rejection: 'pending' | 'period_claimed' | 'not_claimable',
  ): PayShopResult {
    if (input.source === 'scheduled') {
      return { outcome: 'skipped', payout: null };
    }

    if (rejection === 'pending') {
      throw new PayoutPendingError(input.shopId);
    }

    if (rejection === 'period_claimed') {
      throw new ManualPayoutAlreadyUsedError(input.shopId, input.periodKey);
    }

    // Nothing was left to claim between reading availability and claiming it.
    if (input.amountMinor !== undefined) {
      throw new PayoutAmountExceedsAvailableError(input.amountMinor, 0);
    }

    throw new NoPayableAmountError(input.shopId);
  }

  /**
   * The reason a shop cannot be paid right now, or `null` when its account is a
   * usable destination in the shop's Settlement Currency.
   */
  private resolveBlockReason(
    account: PayoutAccountRecord | null,
    currency: string,
  ): PayoutBlockReason | null {
    if (!account) {
      return 'no_payout_account';
    }

    if (account.status === 'pending') {
      return 'payout_account_unverified';
    }

    if (account.status === 'disabled') {
      return 'payout_account_disabled';
    }

    if (account.currency !== currency) {
      return 'payout_account_currency_mismatch';
    }

    return null;
  }
}
