import { ApiProperty } from '@nestjs/swagger';
import type { OrderPayoutAttribution } from '../../../app/ports/order-payout-query.repository';
import type { OrderPayoutMethod } from '../../../app/services/order-payout-method.service';
import type { ShopOrderPayout } from '../../../app/use-cases/get-shop-order-payout/get-shop-order-payout.use-case';

export class OrderPayoutAvailabilityResponseDto {
  @ApiProperty({
    description:
      'Whether Finance recorded that this Order Seller Payable became ' +
      'available, i.e. that every required unit was delivered.',
    example: true,
  })
  recorded!: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'The delivery the availability followed. Null until it is recorded; ' +
      'never derived from the Order status.',
    example: '2026-11-02T10:00:00.000Z',
  })
  available_at!: string | null;
}

export class OrderPayoutAttributionResponseDto {
  @ApiProperty({
    description: 'Public id of the Payout (pay_…).',
    example: 'pay_2f5a91c4b7de',
  })
  id!: string;

  @ApiProperty({
    description:
      '`pending` while the Payout provider transfer may still move the money, ' +
      '`paid` once it settled.',
    enum: ['pending', 'paid'],
    example: 'paid',
  })
  state!: 'pending' | 'paid';

  @ApiProperty({
    description:
      'This Order share of the Payout, in minor units of the shop Settlement ' +
      'Currency.',
    example: 2_500,
  })
  amount_minor!: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Instant the Payout settled. Null while it is still `pending`.',
    example: '2026-11-03T09:00:00.000Z',
  })
  paid_at!: string | null;
}

export class OrderPayoutMethodResponseDto {
  @ApiProperty({
    description:
      'The shop Payout Account state. `missing` means the shop has no open ' +
      'Payout Account yet; the other values are the provider-reported status.',
    enum: [
      'missing',
      'onboarding',
      'action_required',
      'active',
      'restricted',
      'disabled',
    ],
    example: 'active',
  })
  account_status!: OrderPayoutMethod['accountStatus'];

  @ApiProperty({
    description:
      'Whether automatic Payout Runs may pay this shop without a manual request.',
    example: true,
  })
  auto_payout_enabled!: boolean;

  @ApiProperty({
    description:
      'The platform day of month (UTC) on which automatic payouts run.',
    example: 15,
  })
  auto_payout_day_of_month!: number;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description:
      'The next automatic run date (UTC, day precision) for an active account ' +
      'with automatic payouts enabled; null otherwise. Never derived from the ' +
      'Order status.',
    example: '2026-11-15',
  })
  next_payout_date!: string | null;
}

export class ShopOrderPayoutResponseDto {
  @ApiProperty({ description: 'Order public id (ord_…).', example: 'ord_2f5a91c4b7de' })
  order_id!: string;

  @ApiProperty({
    description: 'The currency the Order was charged in (ISO 4217).',
    example: 'USD',
  })
  currency!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'The Seller Payable this Order still holds in the ledger, in minor ' +
      'units, with any refund already netted. Null when the Order has no paid ' +
      'Journal Entry basis yet.',
    example: 2_500,
  })
  seller_payable_minor!: number | null;

  @ApiProperty({ type: OrderPayoutAvailabilityResponseDto })
  availability!: OrderPayoutAvailabilityResponseDto;

  @ApiProperty({
    type: OrderPayoutAttributionResponseDto,
    nullable: true,
    description:
      'The newest Payout that claimed or paid this Order, or null when no ' +
      'Payout has claimed it yet.',
  })
  payout!: OrderPayoutAttributionResponseDto | null;

  @ApiProperty({ type: OrderPayoutMethodResponseDto })
  payout_method!: OrderPayoutMethodResponseDto;
}

export function toOrderPayoutAvailabilityResponse(
  availability: ShopOrderPayout['availability'],
): OrderPayoutAvailabilityResponseDto {
  return {
    recorded: availability.recorded,
    available_at: availability.availableAt
      ? availability.availableAt.toISOString()
      : null,
  };
}

export function toOrderPayoutAttributionResponse(
  payout: OrderPayoutAttribution,
): OrderPayoutAttributionResponseDto {
  return {
    id: payout.id,
    state: payout.state,
    amount_minor: payout.amountMinor,
    paid_at: payout.paidAt ? payout.paidAt.toISOString() : null,
  };
}

export function toOrderPayoutMethodResponse(
  method: OrderPayoutMethod,
): OrderPayoutMethodResponseDto {
  return {
    account_status: method.accountStatus,
    auto_payout_enabled: method.autoPayoutEnabled,
    auto_payout_day_of_month: method.autoPayoutDayOfMonth,
    next_payout_date: method.nextPayoutDate,
  };
}

export function toShopOrderPayoutResponse(
  payout: ShopOrderPayout,
): ShopOrderPayoutResponseDto {
  return {
    order_id: payout.orderId,
    currency: payout.currency,
    seller_payable_minor: payout.sellerPayableMinor,
    availability: toOrderPayoutAvailabilityResponse(payout.availability),
    payout: payout.payout
      ? toOrderPayoutAttributionResponse(payout.payout)
      : null,
    payout_method: toOrderPayoutMethodResponse(payout.payoutMethod),
  };
}
