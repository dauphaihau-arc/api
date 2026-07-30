import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { StorageService } from '~/integrations/storage/app/ports/storage.service';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import type { AuthUserRepository } from '~/domains/auth/app/ports/auth-user.repository';
import {
  UserAccountVersionConflictError,
  type UpdateUserAccountInput,
} from '~/domains/auth/app/ports/auth-user.repository';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import type { UserAccount } from '~/domains/auth/domain/models/user-account';
import { Email } from '~/domains/auth/domain/value-objects/email';
import { RoleKey } from '~/domains/auth/domain/value-objects/role-key';
import {
  ActorNotAllowedToUpdateUsersError,
  UserNotFoundError,
  UserVersionConflictError,
} from '../../errors/user-app.error';
import {
  type UploadedAvatarFile,
  UpdateUserUseCase,
} from './update-user.use-case';

describe('UpdateUserUseCase', () => {
  const adminActor: AuthenticatedUser = {
    userId: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Admin',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: ['admin'],
    permissions: ['users.manage'],
  };

  const existingUser: UserAccount = {
    id: 'user-1',
    version: 3,
    email: Email.create('member@example.com'),
    displayName: 'Member User',
    avatar: 'test/public/users/user-1/images/original/original.png',
    status: UserStatus.ACTIVE,
    roles: [RoleKey.create('customer')],
    permissions: [],
  };

  const updatedUser: UserAccount = {
    ...existingUser,
    version: 4,
    displayName: 'Updated Member',
    avatar: 'test/public/users/user-1/images/original/new.png',
    status: UserStatus.DISABLED,
  };

  function buildDeps() {
    const authUserRepository: jest.Mocked<AuthUserRepository> = {
      findByEmail: jest.fn(),
      findLoginByEmail: jest.fn(),
      findById: jest.fn().mockResolvedValue(existingUser),
      create: jest.fn(),
      update: jest.fn().mockImplementation(
        async (_id: string, input: UpdateUserAccountInput) => ({
          ...updatedUser,
          displayName: input.displayName ?? existingUser.displayName,
          avatar: input.avatar ?? existingUser.avatar,
          status: input.status ?? existingUser.status,
        }),
      ),
      updatePassword: jest.fn(),
      assignRole: jest.fn(),
      ensureRole: jest.fn(),
    };
    const storageService: jest.Mocked<StorageService> = {
      putObject: jest.fn().mockResolvedValue({
        key: updatedUser.avatar!,
        size: 42,
        contentType: 'image/png',
        url: 'https://cdn.example.com/' + updatedUser.avatar,
      }),
      getObject: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn(),
      getPublicUrl: jest.fn((key: string) => `https://cdn.example.com/${key}`),
      ping: jest.fn(),
    };
    const eventEmitter: Pick<jest.Mocked<EventEmitter2>, 'emit'> = {
      emit: jest.fn(),
    };

    return {
      authUserRepository,
      storageService,
      eventEmitter,
    };
  }

  it('updates a user and uploads a new avatar for admins', async () => {
    const { authUserRepository, storageService, eventEmitter } = buildDeps();
    const useCase = new UpdateUserUseCase(
      authUserRepository,
      storageService,
      eventEmitter as unknown as EventEmitter2,
    );

    const result = await useCase.execute(adminActor, 'user-1', {
      version: 3,
      displayName: 'Updated Member',
      status: UserStatus.DISABLED,
      avatarFile: {
        originalname: 'avatar.png',
        mimetype: 'image/png',
        buffer: Buffer.from('avatar'),
      } as UploadedAvatarFile,
    });

    expect(storageService.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(
          /^test\/public\/users\/user-1\/images\/original\/.+\.png$/,
        ),
        contentType: 'image/png',
      }),
    );
    expect(authUserRepository.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        version: 3,
        displayName: 'Updated Member',
        status: UserStatus.DISABLED,
        avatar: updatedUser.avatar,
      }),
    );
    expect(storageService.deleteObject).toHaveBeenCalledWith(
      'test/public/users/user-1/images/original/original.png',
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'user.updated',
      expect.objectContaining({
        userId: 'user-1',
      }),
    );
    expect(result).toEqual({
      isOk: true,
      value: {
        id: 'user-1',
        version: 4,
        email: 'member@example.com',
        displayName: 'Updated Member',
        avatar:
          'https://cdn.example.com/test/public/users/user-1/images/original/new.png',
        status: UserStatus.DISABLED,
      },
    });
  });

  it('rejects non-admin callers', async () => {
    const { authUserRepository, storageService, eventEmitter } = buildDeps();
    const useCase = new UpdateUserUseCase(
      authUserRepository,
      storageService,
      eventEmitter as unknown as EventEmitter2,
    );

    const result = await useCase.execute(
      {
        ...adminActor,
        roles: ['customer'],
      },
      'user-1',
      { version: 3 },
    );

    expect(result.isOk).toBe(false);
    if (result.isOk) {
      throw new Error('Expected update user to fail for non-admin actor');
    }

    expect(result.error).toBeInstanceOf(ActorNotAllowedToUpdateUsersError);
  });

  it('returns not found when the target user does not exist', async () => {
    const { authUserRepository, storageService, eventEmitter } = buildDeps();
    authUserRepository.findById.mockResolvedValue(null);
    const useCase = new UpdateUserUseCase(
      authUserRepository,
      storageService,
      eventEmitter as unknown as EventEmitter2,
    );

    const result = await useCase.execute(adminActor, 'missing-user', {
      version: 3,
    });

    expect(result.isOk).toBe(false);
    if (result.isOk) {
      throw new Error('Expected update user to fail for missing target user');
    }

    expect(result.error).toBeInstanceOf(UserNotFoundError);
  });

  it('returns a version conflict when the request is stale', async () => {
    const { authUserRepository, storageService, eventEmitter } = buildDeps();
    authUserRepository.update.mockRejectedValue(new UserAccountVersionConflictError());
    const useCase = new UpdateUserUseCase(
      authUserRepository,
      storageService,
      eventEmitter as unknown as EventEmitter2,
    );

    const result = await useCase.execute(adminActor, 'user-1', {
      version: 2,
      avatarFile: {
        originalname: 'avatar.png',
        mimetype: 'image/png',
        buffer: Buffer.from('avatar'),
      } as UploadedAvatarFile,
    });

    expect(result.isOk).toBe(false);
    if (result.isOk) {
      throw new Error('Expected update user to fail for stale version');
    }

    expect(storageService.deleteObject).toHaveBeenCalledWith(updatedUser.avatar!);
    expect(result.error).toBeInstanceOf(UserVersionConflictError);
  });
});
