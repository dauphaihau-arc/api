import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { CurrentUserEntity } from '~/domains/auth/infra/persistence/entities/current-user.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { OrderExportStatus } from '../../../domain/enums/order-export-status.enum';

@Entity({ tableName: 'order_exports' })
@Index({ properties: ['shop', 'requestedBy', 'createdAt'] })
@Index({ properties: ['status', 'createdAt'] })
export class OrderExportEntity extends AbstractBaseEntity {
  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  shop!: ShopEntity;

  @ManyToOne(() => CurrentUserEntity, {
    fieldName: 'requested_by_user_id',
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  requestedBy!: CurrentUserEntity;

  @Enum({ items: () => OrderExportStatus })
  status: OrderExportStatus = OrderExportStatus.QUEUED;

  @Property({ fieldName: 'filters_json', type: 'json' })
  filtersJson!: Record<string, unknown>;

  @Property({ fieldName: 'columns_json', type: 'json' })
  columnsJson!: string[];

  @Property({ length: 100 })
  timezone!: string;

  @Property({ fieldName: 'filename', length: 255 })
  filename!: string;

  @Property({ fieldName: 'total_rows', nullable: true })
  totalRows?: number;

  @Property({ fieldName: 'processed_rows', default: 0 })
  processedRows = 0;

  @Property({ fieldName: 'file_storage_key', type: 'text', nullable: true })
  fileStorageKey?: string;

  @Property({ fieldName: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Property({ fieldName: 'completed_at', nullable: true })
  completedAt?: Date;

  @Property({ fieldName: 'expires_at' })
  expiresAt!: Date;
}
