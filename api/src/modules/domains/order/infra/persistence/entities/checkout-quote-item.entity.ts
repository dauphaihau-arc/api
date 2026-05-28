import { Entity, Index, ManyToOne, Property } from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { ProductInventoryEntity } from '~/modules/domains/product/infra/persistence/entities/product-inventory.entity';
import { CheckoutQuoteEntity } from './checkout-quote.entity';

@Entity({ tableName: 'checkout_quote_items' })
@Index({ properties: ['quote'] })
export class CheckoutQuoteItemEntity extends AbstractBaseEntity {
  @ManyToOne(() => CheckoutQuoteEntity, {
    fieldName: 'quote_id',
    deleteRule: 'cascade',
  })
  quote!: CheckoutQuoteEntity;

  @ManyToOne(() => ProductInventoryEntity, {
    fieldName: 'inventory_id',
    deleteRule: 'restrict',
  })
  inventory!: ProductInventoryEntity;

  @Property({ fieldName: 'title', type: 'text' })
  title!: string;

  @Property({ fieldName: 'image_url', type: 'text', nullable: true })
  imageUrl?: string;

  @Property({ fieldName: 'variant_group_name', length: 100, nullable: true })
  variantGroupName?: string;

  @Property({ fieldName: 'variant_sub_group_name', length: 100, nullable: true })
  variantSubGroupName?: string;

  @Property({ fieldName: 'variant_name', length: 255, nullable: true })
  variantName?: string;

  @Property()
  quantity!: number;

  @Property({ fieldName: 'source_currency', length: 3 })
  sourceCurrency!: string;

  @Property({ fieldName: 'unit_price_source_minor' })
  unitPriceSourceMinor!: number;

  @Property({ fieldName: 'line_total_source_minor' })
  lineTotalSourceMinor!: number;

  @Property({ fieldName: 'checkout_currency', length: 3 })
  checkoutCurrency!: string;

  @Property({ fieldName: 'unit_price_checkout_minor' })
  unitPriceCheckoutMinor!: number;

  @Property({ fieldName: 'line_total_checkout_minor' })
  lineTotalCheckoutMinor!: number;

  @Property({ fieldName: 'unit_price_minor' })
  unitPriceMinor!: number;

  @Property({ fieldName: 'original_amount_minor', nullable: true })
  originalAmountMinor?: number;

  @Property({ fieldName: 'line_total_minor' })
  lineTotalMinor!: number;

  @Property({ fieldName: 'currency', length: 3 })
  currency!: string;

  @Property({ fieldName: 'source_price_id', nullable: true })
  sourcePriceId?: string;

  @Property({ fieldName: 'source_type', length: 20, nullable: true })
  sourceType?: 'market_override' | 'base_native' | 'base_fx';

  @Property({ fieldName: 'market_code', length: 20, nullable: true })
  marketCode?: string;

  @Property({ fieldName: 'fx_rate', type: 'text', nullable: true })
  fxRate?: string;

  @Property({ fieldName: 'fx_source', length: 100, nullable: true })
  fxSource?: string;

  @Property({ fieldName: 'fx_effective_at', nullable: true })
  fxEffectiveAt?: Date;

  @Property({ fieldName: 'fx_source_timestamp', nullable: true })
  fxSourceTimestamp?: Date;
}
