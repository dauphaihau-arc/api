import {
  Collection,
  Entity,
  Enum,
  OneToMany,
  OneToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractAuthEntity } from './abstract-auth.entity';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import { CurrentUserCredentialEntity } from './current-user-credential.entity';
import { EmailVerificationTokenEntity } from './email-verification-token.entity';
import { PasswordResetTokenEntity } from './password-reset-token.entity';
import { UserSessionEntity } from './user-session.entity';
import { UserRoleEntity } from './user-role.entity';

@Entity({ tableName: 'users' })
export class CurrentUserEntity extends AbstractAuthEntity {
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

  @OneToOne(
    () => CurrentUserCredentialEntity,
    (credential) => credential.user,
    {
      nullable: true,
      orphanRemoval: true,
    },
  )
  credential?: CurrentUserCredentialEntity;

  @OneToMany(() => UserSessionEntity, (session) => session.user)
  sessions = new Collection<UserSessionEntity>(this);

  @OneToMany(() => PasswordResetTokenEntity, (token) => token.user)
  passwordResetTokens = new Collection<PasswordResetTokenEntity>(this);

  @OneToMany(() => EmailVerificationTokenEntity, (token) => token.user)
  emailVerificationTokens = new Collection<EmailVerificationTokenEntity>(this);

  @OneToMany(() => UserRoleEntity, (userRole) => userRole.user)
  userRoles = new Collection<UserRoleEntity>(this);
}
