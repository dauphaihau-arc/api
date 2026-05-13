import {
  Collection,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  Property,
  Unique
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { ProductEntity } from '~/modules/domains/product/infra/persistence/entities/product.entity';

@Entity({ tableName: 'shops' })
@Index({ properties: ['ownerUser'] })
export class ShopEntity extends AbstractBaseEntity {
  @ManyToOne(() => CurrentUserEntity, {
    fieldName: 'owner_user_id',
    deleteRule: 'restrict',
  })
  ownerUser!: CurrentUserEntity;

  @Property({ fieldName: 'shop_name', length: 20 })
  @Unique()
  shopName!: string;

  @Property({ fieldName: 'status', length: 20 })
  status = 'active';

  @OneToMany(() => ProductEntity, (product) => product.shop)
  products = new Collection<ProductEntity>(this);
}
