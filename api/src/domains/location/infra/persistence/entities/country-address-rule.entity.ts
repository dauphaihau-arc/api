import {
  Entity,
  OptionalProps,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import type { CountryAddressRuleOverride } from '~/domains/location/app/location.types';

/**
 * Arc-owned deltas on top of the `lib-address/lite` defaults. The merged rule
 * set is derived per request and is never stored here.
 */
@Entity({ tableName: 'country_address_rules' })
export class CountryAddressRuleEntity {
  [OptionalProps]?: string;

  @PrimaryKey({ type: 'varchar', length: 2, fieldName: 'country_code' })
  countryCode!: string;

  @Property({ fieldName: 'rules', type: 'jsonb' })
  rules!: CountryAddressRuleOverride;

  @Property({ fieldName: 'created_at' })
  createdAt = new Date();

  @Property({ fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt = new Date();
}
