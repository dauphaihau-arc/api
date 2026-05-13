import {
  Entity,
  OneToOne,
  Property,
  Unique
} from '@mikro-orm/core';
import { AbstractAuthEntity } from './abstract-auth.entity';
import { CurrentUserEntity } from './current-user.entity';

@Entity({ tableName: 'user_preferences' })
export class UserPreferenceEntity extends AbstractAuthEntity {
  @OneToOne(() => CurrentUserEntity, {
    fieldName: 'user_id',
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  @Unique()
  user!: CurrentUserEntity;

  @Property({ fieldName: 'region', length: 100 })
  region!: string;

  @Property({ fieldName: 'language', length: 10 })
  language!: string;

  @Property({ fieldName: 'currency', length: 10 })
  currency!: string;
}
