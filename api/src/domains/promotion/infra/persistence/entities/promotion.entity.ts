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
import { createPublicId } from '~/platform/ids/public-id';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { PromotionApplicationKind } from '../../../domain/enums/promotion-application-kind.enum';
import { PromotionBenefitType } from '../../../domain/enums/promotion-benefit-type.enum';
import { PromotionMinOrderType } from '../../../domain/enums/promotion-min-order-type.enum';
import { PromotionProductScope } from '../../../domain/enums/promotion-product-scope.enum';
import { PromotionVisibility } from '../../../domain/enums/promotion-visibility.enum';
import { PromotionProductEntity } from './promotion-product.entity';

@Entity({ tableName: 'promotions' })
@Index({ properties: ['shop'] })
@Index({ properties: ['shop', 'applicationKind'] })
export class PromotionEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'public_id', length: 32 })
  @Unique()
  publicId: string = createPublicId('prm');

  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'cascade',
  })
  shop!: ShopEntity;

  /**
   * Ordinary internal seller-facing name. It carries no redemption meaning and
   * is deliberately not unique: names never identify an offer to buyers.
   */
  @Property({ fieldName: 'name', length: 255 })
  name!: string;

  @Enum({ items: () => PromotionApplicationKind, fieldName: 'application_kind' })
  applicationKind!: PromotionApplicationKind;

  @Enum({ items: () => PromotionBenefitType, fieldName: 'benefit_type' })
  benefitType!: PromotionBenefitType;

  /**
   * Currency the monetary fields are denominated in, snapshotted from the
   * owning Shop at creation. A later Shop currency change never redefines an
   * existing Promotion's value.
   */
  @Property({ length: 3 })
  currency!: string;

  @Property({ fieldName: 'percent_off', type: 'int', nullable: true })
  percentOff?: number | null;

  @Property({
    fieldName: 'amount_off', type: 'numeric', precision: 12, scale: 2, nullable: true,
  })
  amountOff?: number | null;

  @Enum({ items: () => PromotionProductScope, fieldName: 'product_scope' })
  productScope = PromotionProductScope.ALL;

  /**
   * Checkout-Discount-only fields. They stay null for Sales, which are
   * unconditional and have no Promo Code.
   */
  @Enum({ items: () => PromotionVisibility, nullable: true })
  visibility?: PromotionVisibility | null;

  @Enum({ items: () => PromotionMinOrderType, fieldName: 'min_order_type', nullable: true })
  minOrderType?: PromotionMinOrderType | null;

  @Property({
    fieldName: 'min_order_value', type: 'numeric', precision: 12, scale: 2, default: 0,
  })
  minOrderValue = 0;

  @Property({ fieldName: 'min_purchase_quantity', default: 0 })
  minPurchaseQuantity = 0;

  @Property({ fieldName: 'max_redemptions', type: 'int', nullable: true })
  maxRedemptions?: number | null;

  @Property({ fieldName: 'max_redemptions_per_buyer', type: 'int', nullable: true })
  maxRedemptionsPerBuyer?: number | null;

  /** Start instant of the Promotion Period; inclusive. */
  @Property({ fieldName: 'start_at' })
  startAt!: Date;

  /** End instant of the Promotion Period; exclusive. */
  @Property({ fieldName: 'end_at' })
  endAt!: Date;

  /** IANA timezone the schedule was authored in, retained for later display. */
  @Property({ length: 64 })
  timezone!: string;

  /** Set when a scheduled Promotion is irreversibly cancelled before it starts. */
  @Property({ fieldName: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt?: Date | null;

  /** Set when an active Promotion is irreversibly ended early. */
  @Property({ fieldName: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt?: Date | null;

  @OneToMany(() => PromotionProductEntity, (target) => target.promotion, {
    orphanRemoval: true,
  })
  products = new Collection<PromotionProductEntity>(this);
}
