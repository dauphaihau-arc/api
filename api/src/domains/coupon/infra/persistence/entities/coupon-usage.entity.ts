import {
  Entity, Index, ManyToOne, Property, Unique, 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { CouponEntity } from './coupon.entity';

@Entity({ tableName: 'coupon_usages' })
@Index({ properties: ['coupon'] })
@Index({ properties: ['user'] })
@Unique({ properties: ['coupon', 'orderId'] })
export class CouponUsageEntity extends AbstractBaseEntity {
  @ManyToOne(() => CouponEntity, {
    fieldName: 'coupon_id',
    deleteRule: 'cascade',
  })
  coupon!: CouponEntity;

  @ManyToOne(() => UserEntity, {
    fieldName: 'user_id',
    nullable: true,
    deleteRule: 'cascade',
  })
  user?: UserEntity;

  @Property({ fieldName: 'order_id', type: 'uuid' })
  orderId!: string;

  @Property({ length: 12 })
  code!: string;
}
