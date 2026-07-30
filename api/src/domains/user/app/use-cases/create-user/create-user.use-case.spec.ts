import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { UserCreatedEvent } from '~/domains/user/events/user-created.event';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import type { AuthUserRepository } from '~/domains/auth/app/ports/auth-user.repository';
import type { PasswordHasher } from '~/domains/auth/app/ports/password-hasher';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import type { UserAccount } from '~/domains/auth/domain/models/user-account';
import { Email } from '~/domains/auth/domain/value-objects/email';
import { PasswordHash } from '~/domains/auth/domain/value-objects/password-hash';
import { RoleKey } from '~/domains/auth/domain/value-objects/role-key';
import {
  ActorNotAllowedToCreateUsersError,
  UserEmailAlreadyRegisteredError,
} from '../../errors/user-app.error';
import { CreateUserUseCase } from './create-user.use-case';

describe('CreateUserUseCase', () => {
  const adminActor: AuthenticatedUser = {
    userId: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Admin',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: ['admin'],
    permissions: ['users.manage'],
  };

  const createdUser: UserAccount = {
    id: 'user-1',
    version: 1,
    email: Email.create('member@example.com'),
    displayName: 'Member User',
    status: UserStatus.ACTIVE,
    passwordHash: PasswordHash.fromPersisted(
      '$2b$04$123456789012345678901u8QTs4lJx0pK7ydjXfQ6PS/UPTzQ0zQG',
    ),
    passwordUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
    roles: [RoleKey.create('customer')],
    permissions: [],
  };

  function buildDeps() {
    const authUserRepository: jest.Mocked<AuthUserRepository> = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findLoginByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn().mockResolvedValue(createdUser),
      update: jest.fn(),
      updatePassword: jest.fn(),
      assignRole: jest.fn().mockResolvedValue(undefined),
      ensureRole: jest.fn().mockResolvedValue(undefined),
    };
    const passwordHasher: jest.Mocked<PasswordHasher> = {
      hash: jest
        .fn()
        .mockResolvedValue(
          '$2b$04$123456789012345678901u8QTs4lJx0pK7ydjXfQ6PS/UPTzQ0zQG',
        ),
      matches: jest.fn(),
    };
    const eventEmitter: Pick<jest.Mocked<EventEmitter2>, 'emit'> = {
      emit: jest.fn(),
    };

    return {
      authUserRepository,
      passwordHasher,
      eventEmitter,
    };
  }

  it('creates a customer user when requested by an admin', async () => {
    const { authUserRepository, passwordHasher, eventEmitter } = buildDeps();
    const useCase = new CreateUserUseCase(
      authUserRepository,
      passwordHasher,
      eventEmitter as unknown as EventEmitter2,
    );

    const result = await useCase.execute(adminActor, {
      email: 'member@example.com',
      password: 'password123',
      displayName: 'Member User',
    });

    expect(authUserRepository.assignRole).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        toString: expect.any(Function),
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'user.created',
      expect.objectContaining<UserCreatedEvent>({
        userId: 'user-1',
        email: 'member@example.com',
        displayName: 'Member User',
      }),
    );
    expect(result).toEqual({
      isOk: true,
      value: {
        id: 'user-1',
        version: 1,
        email: 'member@example.com',
        displayName: 'Member User',
        status: UserStatus.ACTIVE,
      },
    });
  });

  it('rejects non-admin callers', async () => {
    const { authUserRepository, passwordHasher, eventEmitter } = buildDeps();
    const useCase = new CreateUserUseCase(
      authUserRepository,
      passwordHasher,
      eventEmitter as unknown as EventEmitter2,
    );

    const result = await useCase.execute(
      {
        ...adminActor,
        roles: ['customer'],
      },
      {
        email: 'member@example.com',
        password: 'password123',
      },
    );

    expect(result.isOk).toBe(false);
    if (result.isOk) {
      throw new Error('Expected create user to fail for non-admin actor');
    }

    expect(result.error).toBeInstanceOf(ActorNotAllowedToCreateUsersError);
  });

  it('rejects duplicate emails', async () => {
    const { authUserRepository, passwordHasher, eventEmitter } = buildDeps();
    authUserRepository.findByEmail.mockResolvedValue(createdUser);
    const useCase = new CreateUserUseCase(
      authUserRepository,
      passwordHasher,
      eventEmitter as unknown as EventEmitter2,
    );

    const result = await useCase.execute(adminActor, {
      email: 'member@example.com',
      password: 'password123',
    });

    expect(result.isOk).toBe(false);
    if (result.isOk) {
      throw new Error('Expected create user to fail for duplicate email');
    }

    expect(result.error).toBeInstanceOf(UserEmailAlreadyRegisteredError);
  });
});
