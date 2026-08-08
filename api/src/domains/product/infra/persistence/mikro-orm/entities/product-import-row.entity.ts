import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ProductImportRowStatus } from '../../../../domain/enums/product-import-row-status.enum';
import { ProductImportEntity } from './product-import.entity';
import { ProductEntity } from './product.entity';

@Entity({ tableName: 'product_import_rows' })
@Index({ properties: ['productImport', 'status'] })
@Unique({ properties: ['productImport', 'rowNumber'] })
export class ProductImportRowEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductImportEntity, {
    fieldName: 'product_import_id',
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  productImport!: ProductImportEntity;

  @Property({ fieldName: 'row_number' })
  rowNumber!: number;

  @Enum({ items: () => ProductImportRowStatus })
  status: ProductImportRowStatus = ProductImportRowStatus.PENDING;

  @Property({ fieldName: 'row_json', type: 'json' })
  rowJson!: Record<string, unknown>;

  @ManyToOne(() => ProductEntity, {
    fieldName: 'product_id',
    nullable: true,
    deleteRule: 'set null',
  })
  product?: ProductEntity;

  @Property({ fieldName: 'sku', length: 255, nullable: true })
  sku?: string;

  @Property({ fieldName: 'title', length: 255, nullable: true })
  title?: string;

  @Property({ fieldName: 'error_code', length: 100, nullable: true })
  errorCode?: string;

  @Property({ fieldName: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;
}
