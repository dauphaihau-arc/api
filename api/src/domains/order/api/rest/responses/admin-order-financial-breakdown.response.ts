import { ApiProperty } from '@nestjs/swagger';
import type { AdminOrderFinancialBreakdown } from '../../../app/use-cases/get-admin-order-financial-breakdown/get-admin-order-financial-breakdown.use-case';

export class AdminOrderFinancialBreakdownResponseDto {
  @ApiProperty({ description: 'Order public id (ord_…).' })
  order_id!: string;

  @ApiProperty({ description: 'Order currency (ISO 4217).' })
  currency!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Platform commission frozen in the ledger for this Order, in minor units. Null when no Journal Entry basis exists.',
  })
  platform_commission_minor!: number | null;
}

export function toAdminOrderFinancialBreakdownResponse(
  breakdown: AdminOrderFinancialBreakdown,
): AdminOrderFinancialBreakdownResponseDto {
  return {
    order_id: breakdown.orderId,
    currency: breakdown.currency,
    platform_commission_minor: breakdown.platformCommissionMinor,
  };
}
