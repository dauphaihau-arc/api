import { Injectable } from '@nestjs/common';
import {
  TransactionsQueryRepository,
  type ShopTransactionsPage,
  type TransactionStatus,
  type TransactionType,
} from '../../ports/transactions-query.repository';

export interface GetShopTransactionsInput {
  shopId: string;
  page: number;
  limit: number;
  type?: TransactionType;
  status?: TransactionStatus;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface GetShopTransactionsResult
  extends Pick<ShopTransactionsPage, 'transactions' | 'totalResults'> {
  page: number;
  limit: number;
}

/**
 * Reads the shop's money movement as one newest-first timeline: Order income,
 * Refunds, and Payouts, each with the sign and status the seller sees. Pages
 * are numbered and ordered by date and internal id, so a row is never repeated
 * or skipped when several rows share an instant.
 */
@Injectable()
export class GetShopTransactionsUseCase {
  constructor(
    private readonly transactionsQueryRepository: TransactionsQueryRepository,
  ) {}

  async execute(
    input: GetShopTransactionsInput,
  ): Promise<GetShopTransactionsResult> {
    const page = await this.transactionsQueryRepository.findPage({
      shopId: input.shopId,
      page: input.page,
      limit: input.limit,
      type: input.type,
      status: input.status,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });

    return {
      transactions: page.transactions,
      totalResults: page.totalResults,
      page: input.page,
      limit: input.limit,
    };
  }
}
