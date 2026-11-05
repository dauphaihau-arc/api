import { ApiProperty } from '@nestjs/swagger';
import { OrderExportStatus } from '../../../domain/enums/order-export-status.enum';
import type { ShopOrderExportSummary } from '../../../app/ports/shop-order-export.repository';

export class ShopOrderExportResponseDto {
  @ApiProperty({ description: 'Export public id (exp_…).' })
  id!: string;

  @ApiProperty({ enum: OrderExportStatus })
  status!: OrderExportStatus;

  @ApiProperty({ description: 'File name the completed export is downloaded as.' })
  filename!: string;

  @ApiProperty({ description: 'Number of rows the export will contain once complete.' })
  total_rows!: number;

  @ApiProperty({ description: 'Number of rows written so far.' })
  processed_rows!: number;

  @ApiProperty({ description: 'Progress percentage, 0–100; 100 once completed.' })
  percent!: number;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Failure reason when the export failed.',
  })
  error_message?: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    required: false,
    nullable: true,
    description: 'When the export completed.',
  })
  completed_at?: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When the generated file stops being downloadable.',
  })
  expires_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at!: Date;
}

export function toShopOrderExportResponse(
  orderExport: ShopOrderExportSummary,
): ShopOrderExportResponseDto {
  return {
    id: orderExport.publicId,
    status: orderExport.status,
    filename: orderExport.filename,
    total_rows: orderExport.totalRows ?? 0,
    processed_rows: orderExport.processedRows,
    percent: calculatePercent(orderExport.processedRows, orderExport.totalRows ?? 0, orderExport.status),
    error_message: orderExport.errorMessage,
    completed_at: orderExport.completedAt,
    expires_at: orderExport.expiresAt,
    created_at: orderExport.createdAt,
    updated_at: orderExport.updatedAt,
  };
}

function calculatePercent(
  processedRows: number,
  totalRows: number,
  status: string,
) {
  if (status === 'completed') {
    return 100;
  }

  if (totalRows <= 0) {
    return 0;
  }

  return Math.min(99, Math.floor((processedRows / totalRows) * 100));
}
