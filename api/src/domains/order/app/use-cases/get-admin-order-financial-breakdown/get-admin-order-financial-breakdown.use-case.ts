import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderNotFoundError } from '../../errors/order-app.error';
import { JournalEntryRepository } from '../../../../finance/app/ports/journal-entry.repository';

/**
 * The financial facts an admin needs for one Order that live outside the Order
 * aggregate itself: the commission frozen in the ledger when the Order was
 * paid. `null` commission means no Journal Entry basis exists yet (for example
 * a cash-on-delivery Order that has not been settled).
 */
export interface AdminOrderFinancialBreakdown {
  /** Order public id (ord_…). */
  orderId: string;
  currency: string;
  platformCommissionMinor: number | null;
}

@Injectable()
export class GetAdminOrderFinancialBreakdownUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly journalEntryRepository: JournalEntryRepository,
  ) {}

  async execute(orderId: string): Promise<AdminOrderFinancialBreakdown> {
    const entityManager = this.entityManager.fork();
    const order = await entityManager
      .getRepository(OrderEntity)
      .findOne({ id: orderId });

    if (!order) {
      throw new OrderNotFoundError();
    }

    const basis = await this.journalEntryRepository.findOrderMoneyBasis(order.id);

    return {
      orderId: order.publicId,
      currency: order.currency,
      platformCommissionMinor: basis ? basis.commissionMinor : null,
    };
  }
}
