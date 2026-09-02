import {
  Entity,
  Index,
  ManyToOne,
  Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ProductInventoryEntity } from './product-inventory.entity';

export const VARIANT_PRICE_TYPES = {
  BASE: 'base',
  MARKET: 'market',
} as const;

export type VariantPriceType =
  typeof VARIANT_PRICE_TYPES[keyof typeof VARIANT_PRICE_TYPES];

@Entity({ tableName: 'variant_prices' })
@Index({ properties: ['productInventory', 'marketCode'] })
export class VariantPriceEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductInventoryEntity, {
    fieldName: 'product_inventory_id',
    deleteRule: 'cascade',
  })
  productInventory!: ProductInventoryEntity;

  @Property({ fieldName: 'price_type', length: 20 })
  priceType: VariantPriceType = VARIANT_PRICE_TYPES.BASE;

  @Property({ fieldName: 'market_code', length: 20, nullable: true })
  marketCode?: string;

  @Property({ fieldName: 'currency', length: 3 })
  currency!: string;

  @Property({ fieldName: 'amount_minor' })
  amountMinor!: number;

  @Property({ fieldName: 'active_from' })
  activeFrom = new Date();

  @Property({ fieldName: 'active_to', nullable: true })
  activeTo?: Date;
}
