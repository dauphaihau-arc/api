import {
  Entity,
  Index,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { ProductEntity } from './product.entity';

@Entity({ tableName: 'product_view_history' })
@Index({ properties: ['product', 'viewedAt'] })
@Index({ properties: ['user', 'viewedAt'] })
@Index({ properties: ['guestSessionId', 'viewedAt'] })
@Unique({ properties: ['user', 'product'] })
@Unique({ properties: ['guestSessionId', 'product'] })
export class ProductViewHistoryEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductEntity, {
    fieldName: 'product_id',
    deleteRule: 'cascade',
  })
  product!: ProductEntity;

  @ManyToOne(() => UserEntity, {
    fieldName: 'user_id',
    nullable: true,
    deleteRule: 'cascade',
  })
  user?: UserEntity;

  @Property({ fieldName: 'guest_session_id', length: 255, nullable: true })
  guestSessionId?: string;

  @Property({ fieldName: 'viewed_at' })
  viewedAt = new Date();
}
