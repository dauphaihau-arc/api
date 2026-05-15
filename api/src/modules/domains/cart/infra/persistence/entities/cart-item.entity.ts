import {
  Entity, Index, ManyToOne, Property, Unique 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { ProductInventoryEntity } from '~/modules/domains/product/infra/persistence/entities/product-inventory.entity';
import { ProductEntity } from '~/modules/domains/product/infra/persistence/entities/product.entity';
import { ShopEntity } from '~/modules/domains/shop/infra/persistence/entities/shop.entity';
import { CartEntity } from './cart.entity';

@Entity({ tableName: 'cart_items' })
@Index({ properties: ['cart'] })
@Index({ properties: ['shop'] })
@Index({ properties: ['productInventory'] })
@Unique({ properties: ['cart', 'productInventory'] })
export class CartItemEntity extends AbstractBaseEntity {
  @ManyToOne(() => CartEntity, {
    fieldName: 'cart_id',
    deleteRule: 'cascade',
  })
  cart!: CartEntity;

  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  @ManyToOne(() => ProductEntity, {
    fieldName: 'product_id',
    deleteRule: 'cascade',
  })
  product!: ProductEntity;

  @ManyToOne(() => ProductInventoryEntity, {
    fieldName: 'product_inventory_id',
    deleteRule: 'cascade',
  })
  productInventory!: ProductInventoryEntity;

  @Property({ fieldName: 'quantity' })
  quantity!: number;

  @Property({ fieldName: 'is_select_order' })
  isSelectOrder = true;
}
