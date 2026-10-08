import {
  Collection,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { createPublicId } from '~/platform/ids/public-id';
import type { MarketplaceCurrency } from '~/platform/config/marketplace.config';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';

@Entity({ tableName: 'shops' })
@Index({ properties: ['ownerUser'] })
export class ShopEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'public_id', length: 32 })
  @Unique()
  publicId: string = createPublicId('shop');

  @ManyToOne(() => UserEntity, {
    fieldName: 'owner_user_id',
    deleteRule: 'restrict',
  })
  ownerUser!: UserEntity;

  @Property({ fieldName: 'shop_name', length: 255 })
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

  /**
   * IANA timezone the shop authors its Sale schedules in. It only supplies the
   * default for a new Sale: each Sale stores the timezone it was created with,
   * so changing this never reinterprets an existing schedule.
   */
  @Property({ fieldName: 'timezone', length: 64 })
  timezone = 'UTC';

  @OneToMany(() => ProductEntity, (product) => product.shop)
  products = new Collection<ProductEntity>(this);
}
