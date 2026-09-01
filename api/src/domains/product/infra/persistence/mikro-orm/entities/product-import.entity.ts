import {
  Collection,
  Entity,
  Enum,
  Index,
  ManyToOne,
  OneToMany,
  Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { ProductImportStatus } from '../../../../domain/enums/product-import-status.enum';
import { ProductImportRowEntity } from './product-import-row.entity';

@Entity({ tableName: 'product_imports' })
@Index({ properties: ['shop', 'requestedBy', 'createdAt'] })
@Index({ properties: ['status', 'createdAt'] })
export class ProductImportEntity extends AbstractBaseEntity {
  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  shop!: ShopEntity;

  @ManyToOne(() => UserEntity, {
    fieldName: 'requested_by_user_id',
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  requestedBy!: UserEntity;

  @Enum({ items: () => ProductImportStatus })
  status: ProductImportStatus = ProductImportStatus.QUEUED;

  @Property({ fieldName: 'template_version', length: 50 })
  templateVersion!: string;

  @Property({ fieldName: 'filename', length: 255 })
  filename!: string;

  @Property({ fieldName: 'source_file_storage_key', type: 'text' })
  sourceFileStorageKey!: string;

  @Property({ fieldName: 'report_file_storage_key', type: 'text', nullable: true })
  reportFileStorageKey?: string;

  @Property({ fieldName: 'total_rows' })
  totalRows!: number;

  @Property({ fieldName: 'processed_rows', default: 0 })
  processedRows = 0;

  @Property({ fieldName: 'created_rows', default: 0 })
  createdRows = 0;

  @Property({ fieldName: 'failed_rows', default: 0 })
  failedRows = 0;

  @Property({ fieldName: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Property({ fieldName: 'completed_at', nullable: true })
  completedAt?: Date;

  @Property({ fieldName: 'source_expires_at' })
  sourceExpiresAt!: Date;

  @Property({ fieldName: 'report_expires_at' })
  reportExpiresAt!: Date;

  @OneToMany(() => ProductImportRowEntity, (row) => row.productImport)
  rows = new Collection<ProductImportRowEntity>(this);
}
