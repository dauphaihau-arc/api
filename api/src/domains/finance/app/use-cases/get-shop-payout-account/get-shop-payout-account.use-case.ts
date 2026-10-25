import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CONNECT_GATEWAY,
  ConnectAccountNotFoundError,
  ConnectNotConfiguredError,
  type ConnectGateway,
} from '~/integrations/payment/app/ports/connect-gateway';
import {
  PayoutAccountRepository,
  type PayoutAccountRecord,
} from '../../ports/payout-account.repository';
import {
  STRIPE_CONNECT_PROVIDER,
  type PayoutAccountStatus,
} from '../../../domain/rules/payout-account';
import { SyncPayoutAccountUseCase } from '../sync-payout-account/sync-payout-account.use-case';

export interface GetShopPayoutAccountInput {
  shopId: string;
}

/**
 * How long an awaiting account's stored state is trusted before a read asks the
 * provider again. Stripe's capability and person events are not all consumed,
 * so a completed onboarding can leave the row `onboarding`; the same interval
 * throttles the re-read so polling cannot call Stripe on every request.
 */
const SELF_HEAL_STALE_AFTER_MS = 15_000;

/**
 * Reads a shop's active Payout Account. A shop that never onboarded reads as
 * `null` rather than as an error.
 *
 * The account is shown as the provider reported it. Its currency is Stripe's
 * `default_currency` for the connected account, not a seller choice, and it need
 * not match the shop's Settlement Currency: Stripe converts the transfer and
 * reports the applied rate, so a different destination currency is simply a
 * currency the provider pays in.
 *
 * A Stripe account still awaiting a decision is re-read once it has been
 * trusted for longer than the throttle interval. The seller returning from
 * hosted onboarding then sees `active` even when the event that said so was
 * never delivered or arrived before the last `account.updated`.
 */
@Injectable()
export class GetShopPayoutAccountUseCase {
  private readonly logger = new Logger(GetShopPayoutAccountUseCase.name);

  constructor(
    private readonly payoutAccountRepository: PayoutAccountRepository,
    private readonly syncPayoutAccountUseCase: SyncPayoutAccountUseCase,
    @Inject(CONNECT_GATEWAY)
    private readonly connectGateway: ConnectGateway,
  ) {}

  async execute(
    input: GetShopPayoutAccountInput,
  ): Promise<PayoutAccountRecord | null> {
    const stored = await this.payoutAccountRepository.findActiveByShopId(
      input.shopId,
    );

    if (!stored || !this.isStaleAwaitingConnectAccount(stored)) {
      return stored;
    }

    try {
      const account = await this.connectGateway.retrieveAccount(
        stored.providerAccountId!,
      );
      const synced = await this.syncPayoutAccountUseCase.execute({ account });

      // Stamped even when the sync found nothing to change, so a polling
      // client waits another interval before the next provider call.
      await this.payoutAccountRepository.touchActive(stored.shopId, new Date());

      return synced ?? stored;
    }
    catch (error) {
      if (
        error instanceof ConnectNotConfiguredError
        || error instanceof ConnectAccountNotFoundError
      ) {
        return stored;
      }

      // A read must not fail because the provider is briefly unreachable; the
      // stored state is still the last answer Stripe gave.
      this.logger.warn(
        `Could not refresh payout account ${stored.id}: ${String(error)}`,
      );

      return stored;
    }
  }

  private isStaleAwaitingConnectAccount(record: PayoutAccountRecord): boolean {
    return record.provider === STRIPE_CONNECT_PROVIDER
      && record.providerAccountId !== null
      && AWAITING_STATUSES[record.status] === true
      && Date.now() - record.updatedAt.getTime() >= SELF_HEAL_STALE_AFTER_MS;
  }
}

const AWAITING_STATUSES: Partial<Record<PayoutAccountStatus, true>> = {
  onboarding: true,
  action_required: true,
};
