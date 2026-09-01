import {
  Entity,
  Enum,
  Property,
  Unique,
} from '@mikro-orm/core';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';

@Entity({ tableName: 'users' })
export class UserEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'version', version: true })
  version = 1;

  @Property({ fieldName: 'email' })
  @Unique()
  email!: string;

  @Property({ fieldName: 'display_name', nullable: true })
  displayName?: string;

  @Property({ fieldName: 'avatar', nullable: true })
  avatar?: string;

  @Enum({ items: () => UserStatus, fieldName: 'status' })
  status = UserStatus.ACTIVE;

  @Property({ fieldName: 'email_verified_at', nullable: true })
  emailVerifiedAt?: Date;
}
