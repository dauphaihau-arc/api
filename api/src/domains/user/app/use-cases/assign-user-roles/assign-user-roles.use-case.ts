import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from '~/platform/application/result';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { isPlatformAdmin } from '~/domains/auth/app/access/platform-admin';
import { AuthUserRepository } from '~/domains/auth/app/ports/auth-user.repository';
import { RoleKey } from '~/domains/auth/domain/value-objects/role-key';
import { UserUpdatedEvent } from '~/domains/user/events/user-updated.event';
import { UserRepository } from '../../ports/user.repository';
import type { UserSummary } from '../../user.types';
import {
  ActorNotAllowedToAssignRolesError,
  LastAdminRoleRequiredError,
  LastSuperAdminRoleRequiredError,
  SelfRoleChangeNotAllowedError,
  UnknownRoleKeysError,
  UserNotFoundError,
} from '../../errors/user-app.error';

export interface AssignUserRolesInput {
  roles: string[];
}

@Injectable()
export class AssignUserRolesUseCase {
  constructor(
    private readonly authUserRepository: AuthUserRepository,
    private readonly userRepository: UserRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    userId: string,
    input: AssignUserRolesInput,
  ): Promise<
    Result<
      UserSummary,
      | ActorNotAllowedToAssignRolesError
      | UserNotFoundError
      | UnknownRoleKeysError
      | SelfRoleChangeNotAllowedError
      | LastAdminRoleRequiredError
      | LastSuperAdminRoleRequiredError
    >
  > {
    if (!isPlatformAdmin(actor.roles)) {
      return err(new ActorNotAllowedToAssignRolesError());
    }

    if (actor.userId === userId) {
      return err(new SelfRoleChangeNotAllowedError());
    }

    const user = await this.authUserRepository.findById(userId);

    if (!user) {
      return err(new UserNotFoundError());
    }

    const roleDefinitions = await this.authUserRepository.findAllRoles();

    const availableKeys = new Set(
      roleDefinitions.map((role) => role.key.toString()),
    );

    const normalizedKeys = input.roles.map((role) =>
      role.trim().toLowerCase(),
    );

    const unknownKeys = normalizedKeys.filter(
      (roleKey) => !availableKeys.has(roleKey),
    );

    if (unknownKeys.length > 0) {
      return err(new UnknownRoleKeysError(Array.from(new Set(unknownKeys))));
    }

    const desiredKeys = Array.from(new Set(normalizedKeys));

    const desiredRoleKeys = desiredKeys.map((roleKey) =>
      RoleKey.create(roleKey),
    );

    const currentKeys = user.roles
      .map((roleKey) => roleKey.toString())
      .sort();
    const sortedDesiredKeys = [...desiredKeys].sort();

    const rolesUnchanged = currentKeys.length === sortedDesiredKeys.length
      && currentKeys.every(
        (roleKey, index) => roleKey === sortedDesiredKeys[index],
      );

    if (!rolesUnchanged) {
      if (currentKeys.includes('admin') && !desiredKeys.includes('admin')) {
        const adminRoleKey = RoleKey.create('admin');
        const adminCount = await this.authUserRepository.countUsersWithRole(
          adminRoleKey,
        );

        if (adminCount <= 1) {
          return err(new LastAdminRoleRequiredError());
        }
      }

      if (
        currentKeys.includes('super_admin')
        && !desiredKeys.includes('super_admin')
      ) {
        const superAdminRoleKey = RoleKey.create('super_admin');

        const superAdminCount = await this.authUserRepository.countUsersWithRole(
          superAdminRoleKey,
        );

        if (superAdminCount <= 1) {
          return err(new LastSuperAdminRoleRequiredError());
        }
      }

      await this.authUserRepository.replaceRoles(userId, desiredRoleKeys);
    }

    this.eventEmitter.emit('user.updated', new UserUpdatedEvent(userId));

    const updatedUser = await this.userRepository.findById(userId);

    if (!updatedUser) {
      return err(new UserNotFoundError());
    }

    return ok(updatedUser);
  }
}
