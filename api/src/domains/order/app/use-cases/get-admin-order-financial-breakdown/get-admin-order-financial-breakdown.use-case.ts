import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderNotFoundError } from '../../errors/order-app.error';
import { JournalEntryRepository } from '../../../../finance/app/ports/journal-entry.repository';
import {
  OrderPayoutQueryRepository,
  type OrderPayoutAttribution,
} from '../../../../finance/app/ports/order-payout-query.repository';
import {
  OrderPayoutMethodService,
  type OrderPayoutMethod,
} from '../../../../finance/app/services/order-payout-method.service';

/** When an Order's Seller Payable became available for payout, as Finance recorded it. */
export interface AdminOrderPayoutAvailability {
  recorded: boolean;
  availableAt: Date | null;
}

/**
 * The financial facts an admin needs for one Order that live outside the Order
 * aggregate itself: the commission frozen in the ledger when the Order was
 * paid, and the payout facts Finance recorded for it. `null` commission means
 * no Journal Entry basis exists yet (for example a cash-on-delivery Order that
 * has not been settled); a null `seller_payable_minor` means the same absence
 * of a paid basis.
 */
export interface AdminOrderFinancialBreakdown {
  /** Order public id (ord_…). */
  orderId: string;
  currency: string;
  platformCommissionMinor: number | null;
  sellerPayableMinor: number | null;
  availability: AdminOrderPayoutAvailability;
  payout: OrderPayoutAttribution | null;

  /** Where the Order money will go and when the next automatic run would take it. */
  payoutMethod: OrderPayoutMethod;
}

@Injectable()
export class GetAdminOrderFinancialBreakdownUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly journalEntryRepository: JournalEntryRepository,
    private readonly orderPayoutQueryRepository: OrderPayoutQueryRepository,
    private readonly orderPayoutMethodService: OrderPayoutMethodService,
  ) {}

  async execute(orderId: string): Promise<AdminOrderFinancialBreakdown> {
    const entityManager = this.entityManager.fork();

    const order = await entityManager
      .getRepository(OrderEntity)
      .findOne({ id: orderId });

    if (!order) {
      throw new OrderNotFoundError();
    }

    const [basis, sellerPayable, payoutFacts, payoutMethod] = await Promise.all([
      this.journalEntryRepository.findOrderMoneyBasis(order.id),
      this.journalEntryRepository.findOrderSellerPayable(order.id),
      this.orderPayoutQueryRepository.findOrderPayoutFacts(order.id),
      this.orderPayoutMethodService.resolve(order.shop.id),
    ]);

    return {
      orderId: order.publicId,
      currency: order.currency,
      platformCommissionMinor: basis ? basis.commissionMinor : null,
      sellerPayableMinor: sellerPayable ? sellerPayable.amountMinor : null,
      availability: {
        recorded: payoutFacts?.availability != null,
        availableAt: payoutFacts?.availability?.availableAt ?? null,
      },
      payout: payoutFacts?.payout ?? null,
      payoutMethod,
    };
  }
}
