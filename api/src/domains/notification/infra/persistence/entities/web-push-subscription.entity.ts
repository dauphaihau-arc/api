import {
  Entity,
  Index,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';

@Entity({ tableName: 'web_push_subscriptions' })
@Index({ properties: ['user', 'isActive'] })
@Unique({ properties: ['endpoint'] })
export class WebPushSubscriptionEntity extends AbstractBaseEntity {
  @ManyToOne(() => UserEntity, {
    fieldName: 'user_id',
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  user!: UserEntity;

  @Property({ type: 'text' })
  endpoint!: string;

  @Property({ fieldName: 'p256dh', type: 'text' })
  p256dh!: string;

  @Property({ fieldName: 'auth', type: 'text' })
  auth!: string;

  @Property({ fieldName: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @Property({ fieldName: 'is_active' })
  isActive = true;

  @Property({ fieldName: 'last_used_at', nullable: true })
  lastUsedAt?: Date;
}
