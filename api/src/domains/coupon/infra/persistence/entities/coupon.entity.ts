import {
  ArrayType, Entity, Enum, Index, ManyToOne, Property, Unique, 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { CouponAppliesTo } from '../../../domain/enums/coupon-applies-to.enum';
import { CouponMinOrderType } from '../../../domain/enums/coupon-min-order-type.enum';
import { CouponType } from '../../../domain/enums/coupon-type.enum';
import { CouponVisibility } from '../../../domain/enums/coupon-visibility.enum';

@Entity({ tableName: 'coupons' })
@Index({ properties: ['shop'] })
@Index({ properties: ['code'] })
@Unique({ properties: ['shop', 'code'] })
export class CouponEntity extends AbstractBaseEntity {
  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'cascade',
  })
  shop!: ShopEntity;

  @Property({ length: 12 })
  code!: string;

  @Enum({ items: () => CouponAppliesTo, fieldName: 'applies_to' })
  appliesTo = CouponAppliesTo.ALL;

  @Property({ fieldName: 'applies_product_ids', type: ArrayType, defaultRaw: '\'{}\'' })
  appliesProductIds: string[] = [];

  @Enum({ items: () => CouponType })
  type!: CouponType;

  /**
   * Currency the monetary fields are denominated in. It is snapshotted from
   * the owning Shop's currency when the Coupon is created and never rewritten
   * afterwards, so a later Shop currency change cannot silently redefine an
   * existing `amountOff` or `minOrderValue`.
   */
  @Property({ length: 3 })
  currency!: string;

  @Property({
    fieldName: 'amount_off', type: 'numeric', precision: 12, scale: 2, default: 0, 
  })
  amountOff = 0;

  @Property({ fieldName: 'percent_off', default: 0 })
  percentOff = 0;

  @Property({ fieldName: 'start_date' })
  startDate!: Date;

  @Property({ fieldName: 'end_date' })
  endDate!: Date;

  @Property({ fieldName: 'max_uses' })
  maxUses!: number;

  @Property({ fieldName: 'max_uses_per_user' })
  maxUsesPerUser!: number;

  @Property({ fieldName: 'uses_count', default: 0 })
  usesCount = 0;

  @Enum({ items: () => CouponMinOrderType, fieldName: 'min_order_type' })
  minOrderType = CouponMinOrderType.NONE;

  @Property({
    fieldName: 'min_order_value', type: 'numeric', precision: 12, scale: 2, default: 0, 
  })
  minOrderValue = 0;

  @Property({ fieldName: 'min_products', default: 0 })
  minProducts = 0;

  @Property({ fieldName: 'is_active', default: true })
  isActive = true;

  @Property({ fieldName: 'is_auto_sale', default: false })
  isAutoSale = false;

  @Enum({ items: () => CouponVisibility, fieldName: 'visibility' })
  visibility = CouponVisibility.CODE_ONLY;
}
