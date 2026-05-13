import { Injectable } from '@nestjs/common';
import { err, Result } from '../../../../../common/application/result';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserCreatedEvent } from '../../../../../common/events/user-created.event';
import {
  AuthResponse,
  RegisterUserInput
} from '../auth.types';
import {
  EmailAlreadyRegisteredError,
  InactiveUserError,
  UserNotFoundError
} from '../errors/auth-app.error';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { Email } from '../../domain/value-objects/email';
import { PasswordHash } from '../../domain/value-objects/password-hash';
import { RoleKey } from '../../domain/value-objects/role-key';
import { PasswordHasher } from '../ports/password-hasher';
import { AuthUserRepository } from '../ports/auth-user.repository';
import { IssueSessionUseCase } from './shared/issue-session.use-case';

const defaultRole = {
  key: RoleKey.create('member'),
  name: 'Member',
  description: 'Default application member role',
} as const;

@Injectable()
export class RegisterUseCase {
  constructor(
    private readonly authUserRepository: AuthUserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly issueSessionUseCase: IssueSessionUseCase,
    private readonly eventEmitter: EventEmitter2
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

    await this.authUserRepository.ensureRole(defaultRole);

    const user = await this.authUserRepository.create({
      email,
      displayName: input.displayName?.trim() || undefined,
      status: UserStatus.ACTIVE,
      passwordHash: PasswordHash.fromPersisted(
        await this.passwordHasher.hash(input.password)
      ),
      passwordUpdatedAt: new Date(),
    });

    await this.authUserRepository.assignRole(user.id, defaultRole.key);

    const authResponse = await this.issueSessionUseCase.execute(user.id);

    this.eventEmitter.emit(
      'user.created',
      new UserCreatedEvent(user.id, user.email.toString(), user.displayName)
    );

    return authResponse;
  }
}
