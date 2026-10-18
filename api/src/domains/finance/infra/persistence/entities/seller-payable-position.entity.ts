import {
  Entity,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';

/**
 * The projected Seller Payable of one shop in one currency, summed from that
 * shop's Postings. It is a projection, never an authority, and holds the
 * available and not-yet-available parts separately.
 */
@Entity({ tableName: 'seller_payable_positions' })
@Unique({ properties: ['shop', 'currency'] })
export class SellerPayablePositionEntity extends AbstractBaseEntity {
  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  @Property({ fieldName: 'currency', length: 3 })
  currency!: string;

  @Property({ fieldName: 'available_minor', default: 0 })
  availableMinor = 0;

  @Property({ fieldName: 'not_yet_available_minor', default: 0 })
  notYetAvailableMinor = 0;
}
