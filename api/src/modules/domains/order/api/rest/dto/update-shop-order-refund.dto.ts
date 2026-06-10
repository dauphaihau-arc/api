import { IsEnum } from 'class-validator';

export enum ShopOrderRefundAction {
  REQUEST = 'request',
  RETRY = 'retry'
}

export class UpdateShopOrderRefundDto {
  @IsEnum(ShopOrderRefundAction)
  action!: ShopOrderRefundAction;
}
