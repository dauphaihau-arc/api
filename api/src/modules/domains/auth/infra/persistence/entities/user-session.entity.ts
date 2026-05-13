import {
  Entity, Index, ManyToOne, Property 
} from '@mikro-orm/core';
import { AbstractAuthEntity } from './abstract-auth.entity';
import { CurrentUserEntity } from './current-user.entity';

@Entity({ tableName: 'user_sessions' })
export class UserSessionEntity extends AbstractAuthEntity {
  @ManyToOne(() => CurrentUserEntity, {
    fieldName: 'user_id',
    deleteRule: 'cascade',
  })
  @Index()
  user!: CurrentUserEntity;

  @Property({ fieldName: 'refresh_token_hash' })
  refreshTokenHash!: string;

  @Property({ fieldName: 'expires_at' })
  @Index()
  expiresAt!: Date;

  @Property({ fieldName: 'revoked_at', nullable: true })
  @Index()
  revokedAt?: Date;

  @Property({ fieldName: 'user_agent', nullable: true })
  userAgent?: string;

  @Property({ fieldName: 'ip_address', nullable: true })
  ipAddress?: string;
}
