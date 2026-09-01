import {
  Collection,
  Entity,
  Enum,
  Index,
  ManyToOne,
  OneToMany,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { OrderEntity } from '~/domains/order/infra/persistence/entities/order.entity';
import { OrderItemEntity } from '~/domains/order/infra/persistence/entities/order-item.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { ProductReviewStatus } from '~/domains/product/domain/enums/product-review-status.enum';
import { ProductEntity } from './product.entity';
import { ProductReviewImageEntity } from './product-review-image.entity';

@Entity({ tableName: 'product_reviews' })
@Index({ properties: ['product', 'status', 'createdAt'] })
@Index({ properties: ['user', 'createdAt'] })
@Unique({ properties: ['user', 'product'] })
export class ProductReviewEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductEntity, {
    fieldName: 'product_id',
    deleteRule: 'cascade',
  })
  product!: ProductEntity;

  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  @ManyToOne(() => UserEntity, {
    fieldName: 'user_id',
    deleteRule: 'cascade',
  })
  user!: UserEntity;

  @ManyToOne(() => OrderEntity, {
    fieldName: 'order_id',
    deleteRule: 'cascade',
  })
  order!: OrderEntity;

  @ManyToOne(() => OrderItemEntity, {
    fieldName: 'order_item_id',
    deleteRule: 'cascade',
  })
  orderItem!: OrderItemEntity;

  @Property()
  rating!: number;

  @Property({ length: 120, nullable: true })
  title?: string;

  @Property({ type: 'text', nullable: true })
  body?: string;

  @Enum({
    items: () => ProductReviewStatus,
    fieldName: 'status',
  })
  status = ProductReviewStatus.PUBLISHED;

  @OneToMany(() => ProductReviewImageEntity, (image) => image.review, {
    orphanRemoval: true,
  })
  images = new Collection<ProductReviewImageEntity>(this);
}
