import {
  Collection, Entity, Enum, Index, ManyToOne, OneToMany, Property, Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { ShippingProfileStatus } from '../../../domain/enums/shipping-profile-status.enum';
import { ShippingProfileRateEntity } from './shipping-profile-rate.entity';

@Entity({ tableName: 'shipping_profiles' })
@Index({ properties: ['shop'] })
@Unique({ properties: ['shop', 'normalizedName'] })
export class ShippingProfileEntity extends AbstractBaseEntity {
  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  @Property({ fieldName: 'name', length: 80 })
  name!: string;

  @Property({ fieldName: 'normalized_name', length: 80 })
  normalizedName!: string;

  @Enum({
    items: () => ShippingProfileStatus,
    fieldName: 'status',
  })
  status = ShippingProfileStatus.DRAFT;

  /**
   * Shop-wide designation offered when a Product is created. At most one profile
   * per shop holds it, and it is never an assignment: no Product becomes
   * assigned because a profile is the default.
   */
  @Property({ fieldName: 'is_default' })
  isDefault = false;

  @Property({ fieldName: 'version' })
  version = 1;

  @Property({ fieldName: 'ship_from_country', length: 2, nullable: true })
  shipFromCountry?: string;

  @Property({ fieldName: 'ship_from_postal', length: 20, nullable: true })
  shipFromPostal?: string;

  /** Elapsed calendar-day handling range before dispatch. */
  @Property({ fieldName: 'processing_time_min_days', nullable: true })
  processingTimeMinDays?: number;

  @Property({ fieldName: 'processing_time_max_days', nullable: true })
  processingTimeMaxDays?: number;

  @OneToMany(
    () => ShippingProfileRateEntity,
    (rate) => rate.shippingProfile,
    { orderBy: { position: 'ASC' } },
  )
  rates = new Collection<ShippingProfileRateEntity>(this);
}
