import {
  Entity,
  OneToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import type {
  MarketplaceCurrency,
  MarketplaceLanguage,
  MarketplaceRegion,
} from '~/platform/config/marketplace.config';
import { AbstractAuthEntity } from './abstract-auth.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';

@Entity({ tableName: 'user_preferences' })
export class UserPreferenceEntity extends AbstractAuthEntity {
  @OneToOne(() => UserEntity, {
    fieldName: 'user_id',
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  @Unique()
  user!: UserEntity;

  @Property({ fieldName: 'region', length: 100 })
  region!: MarketplaceRegion;

  @Property({ fieldName: 'language', length: 10 })
  language!: MarketplaceLanguage;

  @Property({ fieldName: 'currency', length: 10 })
  currency!: MarketplaceCurrency;
}
