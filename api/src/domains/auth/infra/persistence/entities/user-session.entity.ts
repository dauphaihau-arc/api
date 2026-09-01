import {
  Entity, Index, ManyToOne, Property, 
} from '@mikro-orm/core';
import { AbstractAuthEntity } from './abstract-auth.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';

@Entity({ tableName: 'user_sessions' })
export class UserSessionEntity extends AbstractAuthEntity {
  @ManyToOne(() => UserEntity, {
    fieldName: 'user_id',
    deleteRule: 'cascade',
  })
  @Index()
  user!: UserEntity;

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
