import { LockMode, OptimisticLockError } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  AuthUserRepository,
  CreateUserAccountInput,
  UpdateUserAccountInput,
  UserAccountVersionConflictError
} from '../../app/ports/auth-user.repository';
import type { RoleDefinition } from '../../domain/models/role-definition';
import type { UserAccount } from '../../domain/models/user-account';
import { Email } from '../../domain/value-objects/email';
import { PasswordHash } from '../../domain/value-objects/password-hash';
import { PermissionKey } from '../../domain/value-objects/permission-key';
import { RoleKey } from '../../domain/value-objects/role-key';
import { CurrentUserCredentialEntity } from './entities/current-user-credential.entity';
import { CurrentUserEntity } from './entities/current-user.entity';
import { RoleEntity } from './entities/role.entity';
import { UserRoleEntity } from './entities/user-role.entity';

@Injectable()
export class MikroOrmAuthUserRepository implements AuthUserRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findByEmail(email: Email): Promise<UserAccount | null> {
    const userRepository = this.entityManager.fork().getRepository(CurrentUserEntity);
    const user = await userRepository.findOne(
      { email: email.toString() },
      { populate: ['credential', 'userRoles.role.rolePermissions.permission'] }
    );

    return user ? this.toUserAccount(user) : null;
  }

  async findById(id: string): Promise<UserAccount | null> {
    const userRepository = this.entityManager.fork().getRepository(CurrentUserEntity);
    const user = await userRepository.findOne(
      { id },
      { populate: ['credential', 'userRoles.role.rolePermissions.permission'] }
    );

    return user ? this.toUserAccount(user) : null;
  }

  async create(
    input: CreateUserAccountInput,
    entityManager?: EntityManager
  ): Promise<UserAccount> {
    const em = entityManager ?? this.entityManager.fork();
    const userRepository = em.getRepository(CurrentUserEntity);
    const credentialRepository = em.getRepository(
      CurrentUserCredentialEntity
    );
    const user = userRepository.create({
      email: input.email.toString(),
      displayName: input.displayName,
      avatar: undefined,
      status: input.status,
      emailVerifiedAt: input.emailVerifiedAt,
    });
    const credential = credentialRepository.create({
      user,
      passwordHash: input.passwordHash.toString(),
      passwordUpdatedAt: input.passwordUpdatedAt,
    });

    user.credential = credential;

    await em.persistAndFlush([user, credential]);

    return this.toUserAccount(user);
  }

  async update(id: string, input: UpdateUserAccountInput): Promise<UserAccount | null> {
    const entityManager = this.entityManager.fork();
    const userRepository = entityManager.getRepository(CurrentUserEntity);
    try {
      const user = await userRepository.findOne({ id }, {
        populate: ['credential', 'userRoles.role.rolePermissions.permission'],
        lockMode: LockMode.OPTIMISTIC,
        lockVersion: input.version,
      });

      if (!user) {
        return null;
      }

      if (input.displayName !== undefined) {
        user.displayName = input.displayName;
      }

      if (input.avatar !== undefined) {
        user.avatar = input.avatar;
      }

      if (input.status !== undefined) {
        user.status = input.status;
      }

      await entityManager.persistAndFlush(user);

      return this.toUserAccount(user);
    }
    catch (error) {
      if (error instanceof OptimisticLockError) {
        throw new UserAccountVersionConflictError();
      }

      throw error;
    }
  }

  async assignRole(
    userId: string,
    roleKey: RoleKey,
    entityManager?: EntityManager
  ): Promise<void> {
    const em = entityManager ?? this.entityManager.fork();
    const userRepository = em.getRepository(CurrentUserEntity);
    const roleRepository = em.getRepository(RoleEntity);
    const userRoleRepository = em.getRepository(UserRoleEntity);
    const user = await userRepository.findOneOrFail({ id: userId });
    const role = await roleRepository.findOneOrFail({
      key: roleKey.toString(),
    });
    const existingUserRole = await userRoleRepository.findOne({
      user,
      role,
    });

    if (existingUserRole) {
      return;
    }

    const userRole = userRoleRepository.create({
      user,
      role,
      assignedAt: new Date(),
    });

    await em.persistAndFlush(userRole);
  }

  async ensureRole(
    roleDefinition: RoleDefinition,
    entityManager?: EntityManager
  ): Promise<void> {
    const em = entityManager ?? this.entityManager.fork();
    const roleRepository = em.getRepository(RoleEntity);
    const existingRole = await roleRepository.findOne({
      key: roleDefinition.key.toString(),
    });

    if (existingRole) {
      return;
    }

    const role = roleRepository.create({
      key: roleDefinition.key.toString(),
      name: roleDefinition.name,
      description: roleDefinition.description,
    });
    await em.persistAndFlush(role);
  }

  private toUserAccount(user: CurrentUserEntity): UserAccount {
    const roles = user.userRoles
      .getItems()
      .map((userRole) => RoleKey.create(userRole.role.key))
      .sort((left, right) => left.toString().localeCompare(right.toString()));
    const permissions = Array.from(
      new Map(
        user.userRoles.getItems().flatMap((userRole) =>
          userRole.role.rolePermissions.getItems().map((rolePermission) => {
            const key = PermissionKey.create(rolePermission.permission.key);
            return [key.toString(), key] as const;
          })
        )
      ).values()
    ).sort((left, right) => left.toString().localeCompare(right.toString()));

    return {
      id: user.id,
      version: user.version,
      email: Email.create(user.email),
      displayName: user.displayName,
      avatar: user.avatar,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      passwordHash: user.credential
        ? PasswordHash.fromPersisted(user.credential.passwordHash)
        : undefined,
      passwordUpdatedAt: user.credential?.passwordUpdatedAt,
      roles,
      permissions,
    };
  }
}
