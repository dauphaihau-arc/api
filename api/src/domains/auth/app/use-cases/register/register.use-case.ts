import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { err, Result } from '~/platform/application/result';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserCreatedEvent } from '~/domains/user/events/user-created.event';
import { normalizeUserPreferences } from '~/platform/config/marketplace.config';
import {
  AuthResponse,
  RegisterUserInput,
} from '../../auth.types';
import {
  EmailAlreadyRegisteredError,
  InactiveUserError,
  UserNotFoundError,
} from '../../errors/auth-app.error';
import { UserStatus } from '../../../domain/enums/user-status.enum';
import { Email } from '../../../domain/value-objects/email';
import { PasswordHash } from '../../../domain/value-objects/password-hash';
import { RoleKey } from '../../../domain/value-objects/role-key';
import { PasswordHasher } from '../../ports/password-hasher';
import { AuthUserRepository } from '../../ports/auth-user.repository';
import { UserPreferenceRepository } from '../../ports/user-preference.repository';
import { IssueSessionUseCase } from '../issue-session/issue-session.use-case';

const defaultRole = {
  key: RoleKey.create('customer'),
  name: 'Customer',
  description: 'Default application customer role',
} as const;

@Injectable()
export class RegisterUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly authUserRepository: AuthUserRepository,
    private readonly userPreferenceRepository: UserPreferenceRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly issueSessionUseCase: IssueSessionUseCase,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(input: RegisterUserInput): Promise<
    Result<
      AuthResponse,
      EmailAlreadyRegisteredError | InactiveUserError | UserNotFoundError
    >
  > {
    const email = Email.create(input.email);
    const existingUser = await this.authUserRepository.findByEmail(email);

    if (existingUser) {
      return err(new EmailAlreadyRegisteredError());
    }

    const passwordHash = PasswordHash.fromPersisted(
      await this.passwordHasher.hash(input.password),
    );
    const userPreferences = normalizeUserPreferences(
      input.preferences,
    );
    const user = await this.entityManager.transactional(async (entityManager) => {
      await this.authUserRepository.ensureRole(defaultRole, entityManager);

      const createdUser = await this.authUserRepository.create(
        {
          email,
          displayName: input.displayName?.trim() || undefined,
          status: UserStatus.ACTIVE,
          passwordHash,
          passwordUpdatedAt: new Date(),
        },
        entityManager,
      );

      await this.userPreferenceRepository.create(
        {
          userId: createdUser.id,
          ...userPreferences,
        },
        entityManager,
      );

      await this.authUserRepository.assignRole(
        createdUser.id,
        defaultRole.key,
        entityManager,
      );

      return createdUser;
    });

    const authResponse = await this.issueSessionUseCase.execute(
      user.id,
      undefined,
      user,
    );

    this.eventEmitter.emit(
      'user.created',
      new UserCreatedEvent(user.id, user.email.toString(), user.displayName),
    );

    return authResponse;
  }
}
