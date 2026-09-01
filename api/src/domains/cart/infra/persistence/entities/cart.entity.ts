import {
  Collection, Entity, Index, ManyToOne, OneToMany, Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { CartKind } from '../../../domain/enums/cart-kind.enum';
import { CartItemEntity } from './cart-item.entity';

@Entity({ tableName: 'carts' })
@Index({ properties: ['user', 'kind'] })
@Index({ properties: ['guestSessionId', 'kind'] })
export class CartEntity extends AbstractBaseEntity {
  @ManyToOne(() => UserEntity, {
    fieldName: 'user_id',
    deleteRule: 'set null',
    nullable: true,
  })
  user?: UserEntity;

  @Property({ fieldName: 'guest_session_id', length: 255, nullable: true })
  guestSessionId?: string;

  @Property({ fieldName: 'kind', length: 50 })
  kind: CartKind = CartKind.ACTIVE;

  @Property({ fieldName: 'merged_at', nullable: true })
  mergedAt?: Date;

  @Property({ fieldName: 'expires_at', nullable: true })
  expiresAt?: Date;

  @OneToMany(() => CartItemEntity, (item) => item.cart)
  items = new Collection<CartItemEntity>(this);
}
