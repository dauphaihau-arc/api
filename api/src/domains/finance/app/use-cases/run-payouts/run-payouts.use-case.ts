import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { FieldEncryptionService } from '~/platform/crypto/field-encryption.service';
import { createPublicId } from '~/platform/ids/public-id';
import { Clock } from '~/platform/time/clock';
import { PayoutGateway } from '~/integrations/payment/app/ports/payout-gateway';
import { JournalEntryRepository } from '../../ports/journal-entry.repository';
import { PayoutAccountRepository } from '../../ports/payout-account.repository';
import { PayoutCommandRepository } from '../../ports/payout-command.repository';
import { PayoutQueryRepository } from '../../ports/payout-query.repository';
import { SellerPayableCommandRepository } from '../../ports/seller-payable-command.repository';
import {
  buildPaidPayoutPostings,
  paidPayoutMoneyEventKey,
  payoutRunDay,
} from '../../../domain/rules/payout';

/** What one run did, for the worker's log and for verification. */
export interface PayoutRunSummary {
  runDay: string;
  paidShopCount: number;
  skippedShopCount: number;
}

const PAID_PAYOUT_MONEY_EVENT_KIND = 'payout.paid';

/**
 * One execution that pays every shop whose Seller Payable is available in it.
 *
 * The run scans recorded Payout Availability — never the shop's balance as a
 * whole — so a not-yet-available amount can never leave. For each shop it claims
 * the shop's Payout for the platform day, sends it through the payout provider
 * port, and settles it in one transaction: the provider's reference, the Orders
 * discharged, the Journal Entry that reduces Seller Payable, and the projected
 * available figure.
 *
 * Each shop is paid independently: a shop's claim or provider outcome never
 * decides another shop's, and one failure skips that shop rather than the run.
 */
@Injectable()
export class RunPayoutsUseCase {
  private readonly logger = new Logger(RunPayoutsUseCase.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly payoutQueryRepository: PayoutQueryRepository,
    private readonly payoutCommandRepository: PayoutCommandRepository,
    private readonly payoutAccountRepository: PayoutAccountRepository,
    private readonly sellerPayableRepository: SellerPayableCommandRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
    private readonly payoutGateway: PayoutGateway,
    private readonly fieldEncryptionService: FieldEncryptionService,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<PayoutRunSummary> {
    const runDay = payoutRunDay(this.clock.now());
    const shops = await this.payoutQueryRepository.findPayableShops();
    let paidShopCount = 0;
    let skippedShopCount = 0;

    for (const shop of shops) {
      try {
        if (await this.payShop(shop.shopId, shop.currency, runDay)) {
          paidShopCount += 1;
        }
        else {
          skippedShopCount += 1;
        }
      }
      catch (error) {
        // A provider failure leaves the shop's claimed Payout pending and skips
        // this shop for the day; turning exhausted attempts into a failed Payout
        // belongs to the Payout guards, not to the run's loop.
        skippedShopCount += 1;

        this.logger.error(
          `Payout run skipped shop ${shop.shopId} on ${runDay}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { runDay, paidShopCount, skippedShopCount };
  }

  /**
   * Pays one shop for one platform day, or returns `false` when there is nothing
   * to pay it with — no verified Payout Account, nothing available, or a Payout
   * for this day already claimed.
   */
  private async payShop(
    shopId: string,
    currency: string,
    runDay: string,
  ): Promise<boolean> {
    const account = await this.payoutAccountRepository.findPayableByShopId(shopId);

    if (!account) {
      return false;
    }

    // A Settlement Currency change can leave an older account behind; paying it
    // would move money in a currency this shop's availability is not recorded in.
    if (account.currency !== currency) {
      this.logger.error(
        `Shop ${shopId} has available Seller Payable in ${currency} but a Payout Account in ${account.currency}`,
      );

      return false;
    }

    const orders = await this.payoutQueryRepository.findPayableOrders(shopId);
    const amountMinor = orders.reduce((total, order) => total + order.amountMinor, 0);

    if (amountMinor <= 0) {
      return false;
    }

    // The claim is what keeps a later run on the same day, or one while an
    // earlier transfer is still pending, from calling the provider again.
    const payout = await this.payoutCommandRepository.claim(
      {
        publicId: createPublicId('pay'),
        shopId,
        payoutAccountId: account.id,
        currency,
        amountMinor,
        runDay,
      },
      {},
    );

    if (!payout) {
      return false;
    }

    const transfer = await this.payoutGateway.send({
      payoutPublicId: payout.publicId,
      provider: account.provider,
      amountMinor,
      currency: payout.currency,
      destination: {
        type: account.type,
        holderName: account.holderName,
        bankName: account.bankName,
        country: account.country,
        last4: account.last4,
        reference: this.fieldEncryptionService.decrypt(account.providerRefEncrypted),
      },
    });

    return this.entityManager.transactional(async (entityManager) => {
      const paidAt = this.clock.now();

      // The transition from `pending` to `paid` is what the Journal Entry and
      // the discharge hang on, so a Payout already settled (a retried run) is
      // never discharged a second time.
      const settled = await this.payoutCommandRepository.settle(
        {
          payoutId: payout.id,
          providerReference: transfer.reference,
          paidAt,
          orders,
        },
        { entityManager },
      );

      if (!settled) {
        this.logger.error(
          `Payout ${payout.id} for shop ${shopId} was not pending at settle time; nothing was discharged`,
        );

        return false;
      }

      await this.journalEntryRepository.append(
        {
          moneyEventKey: paidPayoutMoneyEventKey(payout.id),
          moneyEventKind: PAID_PAYOUT_MONEY_EVENT_KIND,
          shopId,
          currency: payout.currency,
          occurredAt: paidAt,
          postings: buildPaidPayoutPostings({
            shopId,
            currency: payout.currency,
            amountMinor,
          }),
        },
        { entityManager },
      );

      await this.sellerPayableRepository.dischargeAvailable(
        shopId,
        payout.currency,
        amountMinor,
        { entityManager },
      );

      await entityManager.flush();

      return true;
    });
  }
}
