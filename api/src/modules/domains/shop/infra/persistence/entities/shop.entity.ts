import {
  Collection,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { createPublicId } from '~/common/ids/public-id';
import type { MarketplaceCurrency } from '~/config/marketplace.config';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { ProductEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product.entity';

@Entity({ tableName: 'shops' })
@Index({ properties: ['ownerUser'] })
export class ShopEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'public_id', length: 12 })
  @Unique()
  publicId: string = createPublicId();

  @ManyToOne(() => CurrentUserEntity, {
    fieldName: 'owner_user_id',
    deleteRule: 'restrict',
  })
  ownerUser!: CurrentUserEntity;

  @Property({ fieldName: 'shop_name', length: 20 })
  @Unique()
  shopName!: string;

  @Property({ fieldName: 'slug', length: 255 })
  @Unique()
  slug!: string;

  @Property({ fieldName: 'description', nullable: true })
  description?: string;

  @Property({ fieldName: 'status', length: 20 })
  status = 'active';

  @Property({ fieldName: 'currency', length: 3 })
  currency!: MarketplaceCurrency;

  @OneToMany(() => ProductEntity, (product) => product.shop)
  products = new Collection<ProductEntity>(this);
}
