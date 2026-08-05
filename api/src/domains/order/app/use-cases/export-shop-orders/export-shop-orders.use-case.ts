import { Injectable } from '@nestjs/common';
import { ExportShopOrdersQueryDto } from '../../../api/rest/dto/export-shop-orders.query.dto';
import { ShopOrderExportQueryRepository } from '../../ports/shop-order-export-query.repository';
import { buildShopOrderCsv } from './shop-order-csv';
import { resolveExportColumns } from './shop-order-export-columns';

export interface ShopOrderCsvExport {
  filename: string;
  csv: string;
}

const EXPORT_LIMIT = 10_000;

@Injectable()
export class ExportShopOrdersUseCase {
  constructor(
    private readonly exportQueryRepository: ShopOrderExportQueryRepository,
  ) {}

  async execute(
    shopId: string,
    query: ExportShopOrdersQueryDto,
  ): Promise<ShopOrderCsvExport> {
    const columns = resolveExportColumns(query.columnPreset, query.columns);

    const rows = await this.exportQueryRepository.listForExport(
      shopId,
      query,
      EXPORT_LIMIT,
    );

    return {
      filename: `orders-${formatTimestampForFilename(new Date())}.csv`,
      csv: buildShopOrderCsv(columns, rows),
    };
  }
}

function formatTimestampForFilename(value: Date) {
  return value
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '');
}
