import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

/**
 * One seller's payout preferences. A missing row means the shop never opted in,
 * so automatic Payout Runs skip it and only manual withdrawals move its money.
 */
@Entity({ tableName: 'payout_settings' })
export class PayoutSettingsEntity {
  @PrimaryKey({ type: 'uuid', fieldName: 'shop_id' })
  shopId!: string;

  @Property({ fieldName: 'auto_payout_enabled', default: false })
  autoPayoutEnabled = false;
  @Property({ fieldName: 'auto_payout_enabled_at', type: 'timestamptz', nullable: true })
  autoPayoutEnabledAt?: Date;

  @Property({ fieldName: 'created_at' })
  createdAt = new Date();

  @Property({ fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt = new Date();
}
