import {
  Entity,
  OptionalProps,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';

@Entity({ tableName: 'location_countries' })
export class LocationCountryEntity {
  [OptionalProps]?: string;

  @PrimaryKey({ type: 'varchar', length: 2 })
  code!: string;

  @Property({ fieldName: 'name', length: 255 })
  name!: string;

  @Property({ fieldName: 'postal_code_required', default: false })
  postalCodeRequired = false;

  @Property({ fieldName: 'is_active', default: true })
  isActive = true;

  @Property({ fieldName: 'created_at' })
  createdAt = new Date();

  @Property({ fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt = new Date();
}
