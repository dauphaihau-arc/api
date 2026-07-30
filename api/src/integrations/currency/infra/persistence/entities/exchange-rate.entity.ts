import {
  Entity,
  Index,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';

@Entity({ tableName: 'exchange_rates' })
@Index({ properties: ['fromCurrency', 'toCurrency', 'effectiveAt'] })
@Unique({ properties: ['fromCurrency', 'toCurrency', 'effectiveAt'] })
export class ExchangeRateEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'from_currency', length: 3 })
  fromCurrency!: string;

  @Property({ fieldName: 'to_currency', length: 3 })
  toCurrency!: string;

  @Property({
    fieldName: 'rate',
    type: 'numeric',
    precision: 20,
    scale: 10,
  })
  rate!: string;

  @Property({ fieldName: 'effective_at' })
  effectiveAt!: Date;

  @Property({ fieldName: 'expires_at', nullable: true })
  expiresAt?: Date;

  @Property({ fieldName: 'source', length: 100 })
  source!: string;

  @Property({ fieldName: 'source_timestamp', nullable: true })
  sourceTimestamp?: Date;
}
