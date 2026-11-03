import {
  Entity,
  Enum,
  Index,
  OneToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { createPublicId } from '~/platform/ids/public-id';
import { ShipmentLabelStatus } from '../../../domain/enums/shipment-label-status.enum';
import { ShipmentEntity } from './shipment.entity';

/**
 * A carrier label bought for exactly one prepared Shipment. The label is the
 * carrier's priced artifact: its PDF and tracking number are immutable
 * purchase evidence, and the Shipment's own carrier/tracking mirror them so
 * handover and carrier events keep working unchanged.
 */
@Entity({ tableName: 'shipment_labels' })
@Index({ properties: ['orderId'] })
@Index({ properties: ['shopId'] })
export class ShipmentLabelEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'public_id', length: 32 })
  @Unique()
  publicId: string = createPublicId('lbl');

  @OneToOne(() => ShipmentEntity, {
    fieldName: 'shipment_id',
    owner: true,
    deleteRule: 'cascade',
  })
  @Unique()
  shipment!: ShipmentEntity;

  @Property({ fieldName: 'order_id', columnType: 'uuid' })
  orderId!: string;

  @Property({ fieldName: 'shop_id', columnType: 'uuid' })
  shopId!: string;

  @Property({ length: 255 })
  carrier!: string;

  @Property({ length: 255 })
  service!: string;

  @Property({ fieldName: 'quote_id', length: 255 })
  quoteId!: string;

  /**
   * The carrier's own label id, which its refund endpoint identifies. It is
   * distinct from `publicId`, the local identifier exposed to sellers.
   */
  @Property({ fieldName: 'carrier_label_id', length: 64, default: '' })
  carrierLabelId: string = '';

  @Property({ fieldName: 'tracking_number', length: 255 })
  trackingNumber!: string;

  @Property({ fieldName: 'price_minor' })
  priceMinor!: number;

  @Property({ length: 3 })
  currency!: string;

  @Property({ fieldName: 'pdf_storage_key', length: 512 })
  pdfStorageKey!: string;

  @Enum({ items: () => ShipmentLabelStatus })
  status: ShipmentLabelStatus = ShipmentLabelStatus.PURCHASED;
}
