import {
  Entity, Index, Property, Unique,
} from '@mikro-orm/core';
import { AbstractAuthEntity } from './abstract-auth.entity';

@Entity({ tableName: 'user_credentials' })
export class UserCredentialEntity extends AbstractAuthEntity {
  @Property({ fieldName: 'user_id', type: 'uuid' })
  @Index()
  @Unique()
  userId!: string;

  @Property({ fieldName: 'password_hash' })
  passwordHash!: string;

  @Property({ fieldName: 'password_updated_at' })
  passwordUpdatedAt = new Date();
}
