import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import type { AuthUserRepository } from '~/domains/auth/app/ports/auth-user.repository';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import type { UserAccount } from '~/domains/auth/domain/models/user-account';
import type { RoleDefinition } from '~/domains/auth/domain/models/role-definition';
import { Email } from '~/domains/auth/domain/value-objects/email';
import { RoleKey } from '~/domains/auth/domain/value-objects/role-key';
import type { UserRepository } from '../../ports/user.repository';
import type { UserSummary } from '../../user.types';
import {
  ActorNotAllowedToAssignRolesError,
  LastAdminRoleRequiredError,
  LastSuperAdminRoleRequiredError,
  SelfRoleChangeNotAllowedError,
  UnknownRoleKeysError,
} from '../../errors/user-app.error';
import { AssignUserRolesUseCase } from './assign-user-roles.use-case';

describe('AssignUserRolesUseCase', () => {
  const adminActor: AuthenticatedUser = {
    userId: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Admin',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: ['admin'],
    permissions: ['users.manage', 'roles.manage'],
  };

  const roleDefinitions: RoleDefinition[] = [
    {
      key: RoleKey.create('admin'),
      name: 'Admin',
      description: 'Administrator',
    },
    { key: RoleKey.create('customer'), name: 'Customer' },
    { key: RoleKey.create('seller'), name: 'Seller' },
    { key: RoleKey.create('super_admin'), name: 'Super Admin' },
  ];

  function buildUser(roles: string[]): UserAccount {
    return {
      id: 'user-1',
      version: 1,
      email: Email.create('member@example.com'),
      displayName: 'Member User',
      status: UserStatus.ACTIVE,
      roles: roles.map((role) => RoleKey.create(role)),
      permissions: [],
    };
  }

  function buildSummary(roles: string[]): UserSummary {
    return {
      id: 'user-1',
      version: 1,
      email: 'member@example.com',
      displayName: 'Member User',
      status: UserStatus.ACTIVE,
      roles: [...roles].sort(),
    };
  }

  interface UseCaseDeps {
    authUserRepository: jest.Mocked<AuthUserRepository>;
    userRepository: jest.Mocked<UserRepository>;
    eventEmitter: Pick<jest.Mocked<EventEmitter2>, 'emit'>;
  }

  function buildDeps(user: UserAccount, updatedRoles: string[]): UseCaseDeps {
    const authUserRepository: jest.Mocked<AuthUserRepository> = {
      findByEmail: jest.fn(),
      findLoginByEmail: jest.fn(),
      findById: jest.fn().mockResolvedValue(user),
      create: jest.fn(),
      update: jest.fn(),
      updatePassword: jest.fn(),
      assignRole: jest.fn(),
      replaceRoles: jest.fn().mockResolvedValue(undefined),
      ensureRole: jest.fn(),
      findAllRoles: jest.fn().mockResolvedValue(roleDefinitions),
      countUsersWithRole: jest.fn().mockResolvedValue(2),
    };
    const userRepository: jest.Mocked<UserRepository> = {
      findAll: jest.fn(),
      findById: jest.fn().mockResolvedValue(buildSummary(updatedRoles)),
    };
    const eventEmitter: Pick<jest.Mocked<EventEmitter2>, 'emit'> = {
      emit: jest.fn(),
    };

    return { authUserRepository, userRepository, eventEmitter };
  }

  function buildUseCase(deps: UseCaseDeps) {
    return new AssignUserRolesUseCase(
      deps.authUserRepository,
      deps.userRepository,
      deps.eventEmitter as unknown as EventEmitter2,
    );
  }

  it('replaces roles, returning the refreshed user summary', async () => {
    const deps = buildDeps(buildUser(['customer']), ['admin']);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(adminActor, 'user-1', {
      roles: ['admin'],
    });

    expect(result.isOk).toBe(true);
    const [, replacedRoleKeys] =
      deps.authUserRepository.replaceRoles.mock.calls[0] ?? [];

    expect(replacedRoleKeys?.map((role) => role.toString())).toEqual(['admin']);
    expect(deps.userRepository.findById).toHaveBeenCalledWith('user-1');
    expect(deps.eventEmitter.emit).toHaveBeenCalledWith(
      'user.updated',
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(result.isOk && result.value.roles).toEqual(['admin']);
  });

  it('accepts an empty role set', async () => {
    const deps = buildDeps(buildUser(['customer']), []);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(adminActor, 'user-1', { roles: [] });

    expect(result.isOk).toBe(true);
    expect(deps.authUserRepository.replaceRoles).toHaveBeenCalledWith(
      'user-1',
      [],
    );
  });

  it('rejects unknown role keys without touching assignments', async () => {
    const deps = buildDeps(buildUser(['customer']), ['customer']);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(adminActor, 'user-1', {
      roles: ['customer', 'ghost'],
    });

    expect(result.isOk).toBe(false);
    expect(!result.isOk && result.error).toBeInstanceOf(UnknownRoleKeysError);
    expect(
      !result.isOk ? (result.error as UnknownRoleKeysError).roleKeys : [],
    ).toEqual(['ghost']);
    expect(deps.authUserRepository.replaceRoles).not.toHaveBeenCalled();
  });

  it('rejects changing the actor own roles', async () => {
    const deps = buildDeps(buildUser(['admin']), ['admin']);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(adminActor, adminActor.userId, {
      roles: ['customer'],
    });

    expect(result.isOk).toBe(false);
    expect(!result.isOk && result.error).toBeInstanceOf(
      SelfRoleChangeNotAllowedError,
    );
    expect(deps.authUserRepository.replaceRoles).not.toHaveBeenCalled();
  });

  it('rejects removing the last admin', async () => {
    const deps = buildDeps(buildUser(['admin']), ['customer']);
    deps.authUserRepository.countUsersWithRole.mockResolvedValue(1);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(adminActor, 'user-1', {
      roles: ['customer'],
    });

    expect(result.isOk).toBe(false);
    expect(!result.isOk && result.error).toBeInstanceOf(
      LastAdminRoleRequiredError,
    );
    expect(deps.authUserRepository.replaceRoles).not.toHaveBeenCalled();
  });

  it('promotes an admin to super_admin while keeping the admin role', async () => {
    const deps = buildDeps(buildUser(['admin']), ['admin', 'super_admin']);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(adminActor, 'user-1', {
      roles: ['super_admin', 'admin'],
    });

    expect(result.isOk).toBe(true);
    const [, replacedRoleKeys] =
      deps.authUserRepository.replaceRoles.mock.calls[0] ?? [];

    expect(replacedRoleKeys?.map((role) => role.toString())).toEqual([
      'super_admin',
      'admin',
    ]);
    expect(result.isOk && result.value.roles).toEqual([
      'admin',
      'super_admin',
    ]);
  });

  it('rejects removing the last super admin', async () => {
    const deps = buildDeps(buildUser(['super_admin']), ['customer']);
    deps.authUserRepository.countUsersWithRole.mockResolvedValue(1);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(adminActor, 'user-1', {
      roles: ['customer'],
    });

    expect(result.isOk).toBe(false);
    expect(!result.isOk && result.error).toBeInstanceOf(
      LastSuperAdminRoleRequiredError,
    );
    expect(deps.authUserRepository.replaceRoles).not.toHaveBeenCalled();
  });

  it('allows a super_admin actor to assign roles', async () => {
    const deps = buildDeps(buildUser(['customer']), ['seller']);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(
      { ...adminActor, roles: ['super_admin'] },
      'user-1',
      { roles: ['seller'] },
    );

    expect(result.isOk).toBe(true);
    expect(deps.authUserRepository.replaceRoles).toHaveBeenCalledWith(
      'user-1',
      [expect.objectContaining({ toString: expect.any(Function) })],
    );
  });

  it('does not rewrite assignments when the role set is unchanged', async () => {
    const deps = buildDeps(buildUser(['admin', 'customer']), [
      'admin',
      'customer',
    ]);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(adminActor, 'user-1', {
      roles: ['customer', 'admin'],
    });

    expect(result.isOk).toBe(true);
    expect(deps.authUserRepository.replaceRoles).not.toHaveBeenCalled();
  });

  it('forbids actors without the admin role', async () => {
    const deps = buildDeps(buildUser(['customer']), ['customer']);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(
      { ...adminActor, roles: ['customer'] },
      'user-1',
      { roles: ['seller'] },
    );

    expect(result.isOk).toBe(false);
    expect(!result.isOk && result.error).toBeInstanceOf(
      ActorNotAllowedToAssignRolesError,
    );
  });
});
