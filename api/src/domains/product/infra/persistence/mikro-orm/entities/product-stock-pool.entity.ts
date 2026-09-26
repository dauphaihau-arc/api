import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { ProductInventoryEntity } from './product-inventory.entity';

/**
 * The authoritative holder of one Inventory Item's On-hand Quantity, Reserved
 * Quantity, and On-hand Version. Seller Fulfillment uses exactly one default
 * seller-held pool per Inventory Item; `product_inventory` keeps a derived
 * aggregate for reads. Provider-held pools are deferred and not modelled.
 */
export enum ProductStockPoolCustody {
  SELLER = 'seller',
}

export enum ProductStockPoolLifecycleState {
  ACTIVE = 'active',
  REMOVED = 'removed',
}

export const DEFAULT_SELLER_STOCK_POOL_NAME = 'Default seller pool';

@Entity({ tableName: 'product_stock_pool' })
@Index({ properties: ['inventory'] })
@Index({ properties: ['shop'] })
export class ProductStockPoolEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductInventoryEntity, {
    fieldName: 'inventory_id',
    deleteRule: 'cascade',
  })
  inventory!: ProductInventoryEntity;

  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  @Property({ fieldName: 'name', length: 255 })
  name!: string;

  @Enum({ items: () => ProductStockPoolCustody, fieldName: 'custody' })
  custody = ProductStockPoolCustody.SELLER;

  @Property({ fieldName: 'is_default' })
  isDefault = false;

  @Enum({
    items: () => ProductStockPoolLifecycleState,
    fieldName: 'lifecycle_state',
  })
  lifecycleState = ProductStockPoolLifecycleState.ACTIVE;

  @Property({ fieldName: 'on_hand_quantity' })
  onHandQuantity!: number;

  @Property({ fieldName: 'reserved_quantity' })
  reservedQuantity = 0;

  @Property({ fieldName: 'on_hand_version' })
  onHandVersion = 1;

  @Property({ fieldName: 'stock' })
  stock = 0;
}
