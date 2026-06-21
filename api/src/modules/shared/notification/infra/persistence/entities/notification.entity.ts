import {
  Entity,
  Index,
  ManyToOne,
  Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import type { NotificationChannel } from '../../../app/notification.types';

@Entity({ tableName: 'notifications' })
@Index({ properties: ['user', 'createdAt'] })
@Index({ properties: ['user', 'readAt'] })
export class NotificationEntity extends AbstractBaseEntity {
  @ManyToOne(() => CurrentUserEntity, {
    fieldName: 'user_id',
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  user!: CurrentUserEntity;

  @Property({ length: 100 })
  type!: string;

  @Property({ length: 20 })
  channel: NotificationChannel = 'in_app';

  @Property({ length: 255 })
  title!: string;

  @Property({ type: 'text' })
  body!: string;

  @Property({ type: 'json', nullable: true })
  data?: Record<string, unknown>;

  @Property({ fieldName: 'read_at', nullable: true })
  readAt?: Date;
}
