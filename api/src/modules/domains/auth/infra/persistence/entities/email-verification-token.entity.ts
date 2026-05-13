import {
  Entity, Index, ManyToOne, Property 
} from '@mikro-orm/core';
import { AbstractAuthEntity } from './abstract-auth.entity';
import { CurrentUserEntity } from './current-user.entity';

@Entity({ tableName: 'email_verification_tokens' })
export class EmailVerificationTokenEntity extends AbstractAuthEntity {
  @ManyToOne(() => CurrentUserEntity, {
    fieldName: 'user_id',
    deleteRule: 'cascade',
  })
  @Index()
  user!: CurrentUserEntity;

  @Property({ fieldName: 'token_hash' })
  tokenHash!: string;

  @Property({ fieldName: 'expires_at' })
  expiresAt!: Date;

  @Property({ fieldName: 'used_at', nullable: true })
  usedAt?: Date;
}
