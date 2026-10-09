import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * A per-item failure shared by shop bulk mutation responses. `id` is the
 * public id of the item that failed; `code` is an UPPER_SNAKE_CASE failure
 * code; `reason` is a human-readable summary.
 */
export class BulkItemFailureResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  reason!: string;
}

export class ShopProductBulkMutateResponseDto {
  @ApiProperty({ type: [String], description: 'Product public ids (prod_…) updated.' })
  succeeded_ids!: string[];

  @ApiProperty({ type: [BulkItemFailureResponseDto] })
  @Type(() => BulkItemFailureResponseDto)
  failed!: BulkItemFailureResponseDto[];
}
