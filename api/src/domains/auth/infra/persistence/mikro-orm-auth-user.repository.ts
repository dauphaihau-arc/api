import { LockMode, OptimisticLockError } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  AuthUserRepository,
  CreateUserAccountInput,
  LoginUserAccount,
  UpdateUserAccountInput,
  UserAccountVersionConflictError,
} from '../../app/ports/auth-user.repository';
import type { RoleDefinition } from '../../domain/models/role-definition';
import type { UserAccount } from '../../domain/models/user-account';
import { Email } from '../../domain/value-objects/email';
import { PasswordHash } from '../../domain/value-objects/password-hash';
import { PermissionKey } from '../../domain/value-objects/permission-key';
import { RoleKey } from '../../domain/value-objects/role-key';
import { UserCredentialEntity } from './entities/user-credential.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { RoleEntity } from './entities/role.entity';
import { UserRoleEntity } from './entities/user-role.entity';

@Injectable()
export class MikroOrmAuthUserRepository implements AuthUserRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findByEmail(email: Email): Promise<UserAccount | null> {
    const entityManager = this.entityManager.fork();
    const userRepository = entityManager.getRepository(UserEntity);
    const user = await userRepository.findOne({ email: email.toString() });

    return user ? this.toUserAccount(entityManager, user) : null;
  }

  async findLoginByEmail(email: Email): Promise<LoginUserAccount | null> {
    const entityManager = this.entityManager.fork();
    const userRepository = entityManager.getRepository(UserEntity);
    const credentialRepository = entityManager.getRepository(UserCredentialEntity);
    const user = await userRepository.findOne(
      { email: email.toString() },
      { fields: ['id', 'status'] },
    );

    if (!user) {
      return null;
    }

    const credential = await credentialRepository.findOne({ userId: user.id });

    return {
      id: user.id,
      status: user.status,
      passwordHash: credential
        ? PasswordHash.fromPersisted(credential.passwordHash)
        : undefined,
    };
  }

  async findById(id: string): Promise<UserAccount | null> {
    const entityManager = this.entityManager.fork();
    const userRepository = entityManager.getRepository(UserEntity);
    const user = await userRepository.findOne({ id });

    return user ? this.toUserAccount(entityManager, user) : null;
  }

  async create(
    input: CreateUserAccountInput,
    entityManager?: EntityManager,
  ): Promise<UserAccount> {
    const em = entityManager ?? this.entityManager.fork();
    const userRepository = em.getRepository(UserEntity);
    const credentialRepository = em.getRepository(
      UserCredentialEntity,
    );
    const user = userRepository.create({
      version: 1,
      email: input.email.toString(),
      displayName: input.displayName,
      avatar: undefined,
      status: input.status,
      emailVerifiedAt: input.emailVerifiedAt,
    });
    const credential = credentialRepository.create({
      userId: user.id,
      passwordHash: input.passwordHash.toString(),
      passwordUpdatedAt: input.passwordUpdatedAt,
    });

    await em.persistAndFlush([user, credential]);

    return this.toUserAccount(em, user, credential);
  }

  async update(id: string, input: UpdateUserAccountInput): Promise<UserAccount | null> {
    const entityManager = this.entityManager.fork();
    const userRepository = entityManager.getRepository(UserEntity);
    try {
      const user = await userRepository.findOne({ id }, {
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

      return this.toUserAccount(entityManager, user);
    }
    catch (error) {
      if (error instanceof OptimisticLockError) {
        throw new UserAccountVersionConflictError();
      }

      throw error;
    }
  }

  async updatePassword(input: {
    userId: string;
    passwordHash: PasswordHash;
    passwordUpdatedAt: Date;
  }): Promise<void> {
    const entityManager = this.entityManager.fork();
    const credentialRepository = entityManager.getRepository(
      UserCredentialEntity,
    );
    const credential = await credentialRepository.findOneOrFail({
      userId: input.userId,
    });

    credential.passwordHash = input.passwordHash.toString();
    credential.passwordUpdatedAt = input.passwordUpdatedAt;

    await entityManager.flush();
  }

  async assignRole(
    userId: string,
    roleKey: RoleKey,
    entityManager?: EntityManager,
  ): Promise<void> {
    const em = entityManager ?? this.entityManager.fork();
    const userRepository = em.getRepository(UserEntity);
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
    entityManager?: EntityManager,
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

  private async toUserAccount(
    entityManager: EntityManager,
    user: UserEntity,
    credential?: UserCredentialEntity | null,
  ): Promise<UserAccount> {
    const resolvedCredential = credential ?? await entityManager
      .getRepository(UserCredentialEntity)
      .findOne({ userId: user.id });
    const userRoles = await entityManager.getRepository(UserRoleEntity).find(
      { user },
      { populate: ['role.rolePermissions.permission'] },
    );
    const roles = userRoles
      .map((userRole) => RoleKey.create(userRole.role.key))
      .sort((left, right) => left.toString().localeCompare(right.toString()));
    const permissions = Array.from(
      new Map(
        userRoles.flatMap((userRole) =>
          userRole.role.rolePermissions.getItems().map((rolePermission) => {
            const key = PermissionKey.create(rolePermission.permission.key);
            return [key.toString(), key] as const;
          }),
        ),
      ).values(),
    ).sort((left, right) => left.toString().localeCompare(right.toString()));

    return {
      id: user.id,
      version: user.version,
      email: Email.create(user.email),
      displayName: user.displayName,
      avatar: user.avatar,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      passwordHash: resolvedCredential
        ? PasswordHash.fromPersisted(resolvedCredential.passwordHash)
        : undefined,
      passwordUpdatedAt: resolvedCredential?.passwordUpdatedAt,
      roles,
      permissions,
    };
  }
}
