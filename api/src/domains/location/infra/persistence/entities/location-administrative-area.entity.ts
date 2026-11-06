import {
  Entity,
  Index,
  ManyToOne,
  OptionalProps,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { LocationCountryEntity } from './location-country.entity';

@Entity({ tableName: 'location_administrative_areas' })
@Index({ properties: ['country', 'isActive'] })
export class LocationAdministrativeAreaEntity {
  [OptionalProps]?: string;

  @PrimaryKey({ type: 'varchar', length: 16 })
  code!: string;

  @ManyToOne(() => LocationCountryEntity, {
    fieldName: 'country_code',
    updateRule: 'cascade',
    deleteRule: 'restrict',
  })
  country!: LocationCountryEntity;

  @Property({ fieldName: 'name', length: 255 })
  name!: string;

  @Property({ fieldName: 'type', length: 64, nullable: true })
  type?: string;

  @Property({ fieldName: 'is_active', default: true })
  isActive = true;

  @Property({ fieldName: 'created_at' })
  createdAt = new Date();

  @Property({ fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt = new Date();
}
