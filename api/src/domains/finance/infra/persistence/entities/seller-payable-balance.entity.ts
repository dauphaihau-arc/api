import {
  Entity,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';

/**
 * The projected Seller Payable of one shop, summed from that shop's Postings
 * and held in the shop's Settlement Currency. It is a projection, never an
 * authority, and holds the available and not-yet-available parts separately.
 *
 * One row per shop: every Posting already settles in the shop's Settlement
 * Currency, so a shop never holds a balance in two currencies at once.
 */
@Entity({ tableName: 'seller_payable_balances' })
@Unique({ properties: ['shop'] })
export class SellerPayableBalanceEntity extends AbstractBaseEntity {
  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  @Property({ fieldName: 'currency', length: 3 })
  currency!: string;

  @Property({ fieldName: 'available_balance_minor', default: 0 })
  availableBalanceMinor = 0;

  @Property({ fieldName: 'pending_balance_minor', default: 0 })
  pendingBalanceMinor = 0;
}
