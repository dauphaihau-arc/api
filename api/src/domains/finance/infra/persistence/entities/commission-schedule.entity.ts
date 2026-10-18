import {
  Entity, ManyToOne, Property, Unique, 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';

/**
 * A shop's Platform Commission rule as of an effective-from instant. One row per
 * shop and effective-from; replacing a rate updates the row at that instant and
 * leaves every earlier schedule, and every Order already posted under it, alone.
 */
@Entity({ tableName: 'commission_schedules' })
@Unique({ properties: ['shop', 'effectiveFrom'] })
export class CommissionScheduleEntity extends AbstractBaseEntity {
  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  @Property({ fieldName: 'effective_from', type: 'timestamptz' })
  effectiveFrom!: Date;

  /** Platform Commission rate in basis points of the discounted item subtotal. */
  @Property({ fieldName: 'rate_basis_points' })
  rateBasisPoints!: number;
}
