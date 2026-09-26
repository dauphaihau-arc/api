import {
  Entity,
  Index,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { FulfillmentGroupEntity } from './fulfillment-group.entity';

@Entity({ tableName: 'fulfillment_group_items' })
@Index({ properties: ['group'] })
@Unique({ properties: ['group', 'orderItemId'] })
export class FulfillmentGroupItemEntity extends AbstractBaseEntity {
  @ManyToOne(() => FulfillmentGroupEntity, {
    fieldName: 'group_id',
    deleteRule: 'cascade',
  })
  group!: FulfillmentGroupEntity;

  @Property({ fieldName: 'order_item_id', columnType: 'uuid' })
  orderItemId!: string;

  @Property()
  quantity!: number;
}
