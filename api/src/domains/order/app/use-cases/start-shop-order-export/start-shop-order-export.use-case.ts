import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { appJobDeduplicationKey } from '~/platform/jobs/app-job-deduplication';
import { appJobName } from '~/platform/jobs/app-job.names';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ExportShopOrdersQueryDto } from '../../../api/rest/dto/export-shop-orders.query.dto';
import {
  ShopOrderExportRepository,
  type ShopOrderExportSummary,
} from '../../ports/shop-order-export.repository';
import { ShopOrderExportQueryRepository } from '../../ports/shop-order-export-query.repository';
import { resolveExportColumns } from '../export-shop-orders/shop-order-export-columns';

@Injectable()
export class StartShopOrderExportUseCase {
  constructor(
    private readonly orderExportRepository: ShopOrderExportRepository,
    private readonly exportQueryRepository: ShopOrderExportQueryRepository,
    private readonly jobDispatcher: JobDispatcher,
  ) {}

  async execute(
    shopId: string,
    currentUser: AuthenticatedUser,
    query: ExportShopOrdersQueryDto,
  ): Promise<ShopOrderExportSummary> {
    const exportColumns = resolveExportColumns(query.columnPreset, query.columns);
    const totalRows = await this.exportQueryRepository.countForExport(shopId, query);

    const orderExport = await this.orderExportRepository.createQueued({
      shopId,
      requestedByUserId: currentUser.userId,
      filtersJson: toExportFilterSnapshot(query),
      columnsJson: exportColumns.map(column => column.id),
      timezone: query.timezone,
      filename: `orders-${formatTimestampForFilename(new Date())}.csv`,
      totalRows,
      expiresAt: new Date(Date.now() + ms('7d')),
    });

    await this.jobDispatcher.dispatch(
      appJobName.processShopOrderExport,
      { exportId: orderExport.id },
      {
        deduplicationKey: appJobDeduplicationKey.processShopOrderExport(orderExport.id),
        delayMs: 1,
      },
    );

    return orderExport;
  }
}

export function toExportFilterSnapshot(
  query: ExportShopOrdersQueryDto,
): Record<string, unknown> {
  return {
    status: query.status,
    shippingStatus: query.shippingStatus,
    createdFrom: query.createdFrom?.toISOString(),
    createdTo: query.createdTo?.toISOString(),
    amountMin: query.amountMin,
    amountMax: query.amountMax,
    currency: query.currency,
    paymentType: query.paymentType,
    search: query.search,
    dateRange: query.dateRange,
    timezone: query.timezone,
    columnPreset: query.columnPreset,
    columns: query.columns,
  };
}

function formatTimestampForFilename(value: Date) {
  return value
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '');
}
