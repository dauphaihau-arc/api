import { Collection, Entity, Index, ManyToOne, OneToMany, Property } from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { CartItemEntity } from './cart-item.entity';

@Entity({ tableName: 'carts' })
@Index({ properties: ['user', 'isTemp'] })
export class CartEntity extends AbstractBaseEntity {
  @ManyToOne(() => CurrentUserEntity, {
    fieldName: 'user_id',
    deleteRule: 'cascade',
  })
  user!: CurrentUserEntity;

  @Property({ fieldName: 'is_temp' })
  isTemp = false;

  @OneToMany(() => CartItemEntity, (item) => item.cart)
  items = new Collection<CartItemEntity>(this);
}
