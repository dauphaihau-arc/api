import {
  Entity, Index, ManyToOne, Property, Unique 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
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

  @ManyToOne(() => CurrentUserEntity, {
    fieldName: 'user_id',
    deleteRule: 'cascade',
  })
  user!: CurrentUserEntity;

  @Property({ fieldName: 'order_id', type: 'uuid' })
  orderId!: string;

  @Property({ length: 12 })
  code!: string;
}
