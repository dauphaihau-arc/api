import {
  Entity, Enum, Index, ManyToOne, Property, 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { ProductShippingCharge } from '~/modules/domains/product/domain/enums/product-shipping-charge.enum';
import { ProductShippingProfileEntity } from './product-shipping-profile.entity';

@Entity({ tableName: 'product_shipping_destinations' })
@Index({ properties: ['shippingProfile'] })
@Index({ properties: ['countryCode'] })
export class ProductShippingDestinationEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductShippingProfileEntity, {
    fieldName: 'product_shipping_profile_id',
    deleteRule: 'cascade',
  })
  shippingProfile!: ProductShippingProfileEntity;

  @Property({ fieldName: 'country_code', length: 2 })
  countryCode!: string;

  @Property({ fieldName: 'delivery_time_label', length: 100 })
  deliveryTimeLabel!: string;

  @Property({ fieldName: 'service', length: 100 })
  service!: string;

  @Enum({
    items: () => ProductShippingCharge,
    fieldName: 'charge_type',
  })
  chargeType = ProductShippingCharge.FREE_SHIPPING;

  @Property({ fieldName: 'rank' })
  rank = 1;
}
