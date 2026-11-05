import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ProductImportSummary } from '~/domains/product/app/ports/product-import.types';
import { ProductImportStatus } from '~/domains/product/domain/enums/product-import-status.enum';

export class ShopProductImportResponseDto {
  @ApiProperty({ description: 'Import public id (imp_…).' })
  id!: string;

  @ApiProperty({ enum: ProductImportStatus })
  status!: ProductImportStatus;

  @ApiProperty()
  filename!: string;

  @ApiProperty()
  template_version!: string;

  @ApiProperty()
  total_rows!: number;

  @ApiProperty()
  processed_rows!: number;

  @ApiProperty()
  created_rows!: number;

  @ApiProperty()
  failed_rows!: number;

  @ApiProperty()
  unprocessed_rows!: number;

  @ApiPropertyOptional()
  error_message?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  completed_at?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at!: string;
}

export function toShopProductImportResponse(
  productImport: ProductImportSummary,
): ShopProductImportResponseDto {
  return {
    id: productImport.publicId,
    status: productImport.status,
    filename: productImport.filename,
    template_version: productImport.templateVersion,
    total_rows: productImport.totalRows,
    processed_rows: productImport.processedRows,
    created_rows: productImport.createdRows,
    failed_rows: productImport.failedRows,
    unprocessed_rows: Math.max(productImport.totalRows - productImport.processedRows, 0),
    error_message: productImport.errorMessage,
    completed_at: productImport.completedAt?.toISOString(),
    created_at: productImport.createdAt.toISOString(),
    updated_at: productImport.updatedAt.toISOString(),
  };
}
