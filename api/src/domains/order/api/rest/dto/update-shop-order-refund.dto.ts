import { IsEnum } from 'class-validator';

export enum ShopOrderRefundAction {
  REQUEST = 'request',
  RETRY = 'retry',
}

/**
 * A seller refund action. A request always returns the whole remaining
 * refundable amount of the Order, so the caller never names a sum.
 */
export class UpdateShopOrderRefundDto {
  @IsEnum(ShopOrderRefundAction)
  action!: ShopOrderRefundAction;
}
