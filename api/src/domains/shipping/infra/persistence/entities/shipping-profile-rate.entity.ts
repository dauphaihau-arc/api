import {
  Entity, Enum, Index, ManyToOne, Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShippingDestinationScope } from '../../../domain/enums/shipping-destination-scope.enum';
import { ShippingProfileEntity } from './shipping-profile.entity';

@Entity({ tableName: 'shipping_profile_rates' })
@Index({ properties: ['shippingProfile'] })
@Index({ properties: ['shippingProfile', 'destinationScope'] })
export class ShippingProfileRateEntity extends AbstractBaseEntity {
  @ManyToOne(() => ShippingProfileEntity, {
    fieldName: 'shipping_profile_id',
    deleteRule: 'cascade',
  })
  shippingProfile!: ShippingProfileEntity;

  @Property({ fieldName: 'position' })
  position = 1;

  @Enum({
    items: () => ShippingDestinationScope,
    fieldName: 'destination_scope',
  })
  destinationScope = ShippingDestinationScope.EVERYWHERE_ELSE;

  @Property({ fieldName: 'destination_country', length: 2, nullable: true })
  destinationCountry?: string;

  @Property({ fieldName: 'one_item_fee_minor' })
  oneItemFeeMinor = 0;

  @Property({ fieldName: 'additional_item_fee_minor' })
  additionalItemFeeMinor = 0;

  /** Elapsed calendar-day transit range after dispatch. */
  @Property({ fieldName: 'delivery_time_min_days', nullable: true })
  deliveryTimeMinDays?: number;

  @Property({ fieldName: 'delivery_time_max_days', nullable: true })
  deliveryTimeMaxDays?: number;
}
