import { Injectable } from '@nestjs/common';
import { err, ok, Result } from '~/platform/application/result';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserCreatedEvent } from '~/domains/user/events/user-created.event';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { isPlatformAdmin } from '~/domains/auth/app/access/platform-admin';
import { AuthUserRepository } from '~/domains/auth/app/ports/auth-user.repository';
import { PasswordHasher } from '~/domains/auth/app/ports/password-hasher';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import { Email } from '~/domains/auth/domain/value-objects/email';
import { PasswordHash } from '~/domains/auth/domain/value-objects/password-hash';
import { RoleKey } from '~/domains/auth/domain/value-objects/role-key';
import type { UserSummary } from '../../user.types';
import {
  ActorNotAllowedToCreateUsersError,
  UserEmailAlreadyRegisteredError,
} from '../../errors/user-app.error';

const defaultRole = {
  key: RoleKey.create('customer'),
  name: 'Customer',
  description: 'Default application customer role',
} as const;

export interface CreateUserInput {
  email: string;
  password: string;
  displayName?: string;
}

@Injectable()
export class CreateUserUseCase {
  constructor(
    private readonly authUserRepository: AuthUserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    input: CreateUserInput,
  ): Promise<
    Result<
      UserSummary,
      ActorNotAllowedToCreateUsersError | UserEmailAlreadyRegisteredError
    >
  > {
    if (!isPlatformAdmin(actor.roles)) {
      return err(new ActorNotAllowedToCreateUsersError());
    }

    const email = Email.create(input.email);
    const existingUser = await this.authUserRepository.findByEmail(email);

    if (existingUser) {
      return err(new UserEmailAlreadyRegisteredError());
    }

    await this.authUserRepository.ensureRole(defaultRole);

    const user = await this.authUserRepository.create({
      email,
      displayName: input.displayName?.trim() || undefined,
      status: UserStatus.ACTIVE,
      passwordHash: PasswordHash.fromPersisted(
        await this.passwordHasher.hash(input.password),
      ),
      passwordUpdatedAt: new Date(),
    });

    await this.authUserRepository.assignRole(user.id, defaultRole.key);

    const createdUser = (await this.authUserRepository.findById(user.id)) ?? user;

    this.eventEmitter.emit(
      'user.created',
      new UserCreatedEvent(
        createdUser.id,
        createdUser.email.toString(),
        createdUser.displayName,
      ),
    );

    return ok({
      id: createdUser.id,
      version: createdUser.version,
      email: createdUser.email.toString(),
      displayName: createdUser.displayName,
      status: createdUser.status,
      roles: createdUser.roles.map((role) => role.toString()),
    });
  }
}
