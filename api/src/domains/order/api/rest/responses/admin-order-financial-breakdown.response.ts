import { ApiProperty } from '@nestjs/swagger';
import type { AdminOrderFinancialBreakdown } from '../../../app/use-cases/get-admin-order-financial-breakdown/get-admin-order-financial-breakdown.use-case';
import {
  OrderPayoutAttributionResponseDto,
  OrderPayoutAvailabilityResponseDto,
  OrderPayoutMethodResponseDto,
  toOrderPayoutAttributionResponse,
  toOrderPayoutAvailabilityResponse,
  toOrderPayoutMethodResponse,
} from '../../../../finance/api/rest/responses/order-payout.response';

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

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Seller Payable this Order still holds in the ledger, in minor units, refunds already netted. Null when no paid Journal Entry basis exists.',
  })
  seller_payable_minor!: number | null;

  @ApiProperty({ type: OrderPayoutAvailabilityResponseDto })
  availability!: OrderPayoutAvailabilityResponseDto;

  @ApiProperty({
    type: OrderPayoutAttributionResponseDto,
    nullable: true,
    description:
      'The newest Payout that claimed or paid this Order, or null when no Payout has claimed it yet.',
  })
  payout!: OrderPayoutAttributionResponseDto | null;

  @ApiProperty({ type: OrderPayoutMethodResponseDto })
  payout_method!: OrderPayoutMethodResponseDto;
}

export function toAdminOrderFinancialBreakdownResponse(
  breakdown: AdminOrderFinancialBreakdown,
): AdminOrderFinancialBreakdownResponseDto {
  return {
    order_id: breakdown.orderId,
    currency: breakdown.currency,
    platform_commission_minor: breakdown.platformCommissionMinor,
    seller_payable_minor: breakdown.sellerPayableMinor,
    availability: toOrderPayoutAvailabilityResponse(breakdown.availability),
    payout: breakdown.payout
      ? toOrderPayoutAttributionResponse(breakdown.payout)
      : null,
    payout_method: toOrderPayoutMethodResponse(breakdown.payoutMethod),
  };
}
