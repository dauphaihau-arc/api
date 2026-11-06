import { Entity, Property } from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';

@Entity({ tableName: 'location_dataset_versions' })
export class LocationDatasetVersionEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'version', length: 128 })
  version!: string;

  @Property({ fieldName: 'source', length: 255 })
  source!: string;

  @Property({ fieldName: 'checksum', length: 64 })
  checksum!: string;

  @Property({ fieldName: 'imported_at' })
  importedAt = new Date();

  @Property({ fieldName: 'is_current', default: false })
  isCurrent = false;
}
