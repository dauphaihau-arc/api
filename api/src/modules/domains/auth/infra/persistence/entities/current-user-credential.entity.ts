import {
  Entity, OneToOne, Property, Unique 
} from '@mikro-orm/core';
import { AbstractAuthEntity } from './abstract-auth.entity';
import { CurrentUserEntity } from './current-user.entity';

@Entity({ tableName: 'user_credentials' })
export class CurrentUserCredentialEntity extends AbstractAuthEntity {
  @OneToOne(() => CurrentUserEntity, (user) => user.credential, {
    owner: true,
    fieldName: 'user_id',
    deleteRule: 'cascade',
  })
  @Unique()
  user!: CurrentUserEntity;

  @Property({ fieldName: 'password_hash' })
  passwordHash!: string;

  @Property({ fieldName: 'password_updated_at' })
  passwordUpdatedAt = new Date();
}
