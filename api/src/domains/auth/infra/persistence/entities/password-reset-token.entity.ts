import {
  Entity, Index, ManyToOne, Property, 
} from '@mikro-orm/core';
import { AbstractAuthEntity } from './abstract-auth.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';

@Entity({ tableName: 'password_reset_tokens' })
export class PasswordResetTokenEntity extends AbstractAuthEntity {
  @ManyToOne(() => UserEntity, {
    fieldName: 'user_id',
    deleteRule: 'cascade',
  })
  @Index()
  user!: UserEntity;

  @Property({ fieldName: 'token_hash' })
  tokenHash!: string;

  @Property({ fieldName: 'expires_at' })
  expiresAt!: Date;

  @Property({ fieldName: 'used_at', nullable: true })
  usedAt?: Date;
}
