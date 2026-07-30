import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from '~/platform/application/result';
import { UserUpdatedEvent } from '~/domains/user/events/user-updated.event';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import {
  buildStorageObjectKey,
  resolveImageExtension,
  resolveStorageEnvironmentSegment,
} from '~/integrations/storage/app/storage-key-builder';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import type { UserAccount } from '~/domains/auth/domain/models/user-account';
import {
  AuthUserRepository,
  UserAccountVersionConflictError,
} from '~/domains/auth/app/ports/auth-user.repository';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import type { UserSummary } from '../../user.types';
import {
  ActorNotAllowedToUpdateUsersError,
  UserNotFoundError,
  UserVersionConflictError,
} from '../../errors/user-app.error';

export interface UploadedAvatarFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

export interface UpdateUserInput {
  version: number;
  displayName?: string;
  status?: UserStatus;
  avatarFile?: UploadedAvatarFile;
}

@Injectable()
export class UpdateUserUseCase {
  constructor(
    private readonly authUserRepository: AuthUserRepository,
    private readonly storageService: StorageService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    userId: string,
    input: UpdateUserInput,
  ): Promise<
    Result<
      UserSummary,
      | ActorNotAllowedToUpdateUsersError
      | UserNotFoundError
      | UserVersionConflictError
    >
  > {
    if (!actor.roles.includes('admin')) {
      return err(new ActorNotAllowedToUpdateUsersError());
    }

    const existingUser = await this.authUserRepository.findById(userId);

    if (!existingUser) {
      return err(new UserNotFoundError());
    }

    let avatarKey: string | undefined;

    if (input.avatarFile) {
      const storedAvatar = await this.storageService.putObject({
        key: this.buildAvatarKey(userId, input.avatarFile.mimetype),
        body: input.avatarFile.buffer,
        contentType: input.avatarFile.mimetype,
      });
      avatarKey = storedAvatar.key;
    }

    let updatedUser: UserAccount | null;
    try {
      updatedUser = await this.authUserRepository.update(userId, {
        version: input.version,
        ...(input.displayName !== undefined
          ? { displayName: input.displayName }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(avatarKey !== undefined ? { avatar: avatarKey } : {}),
      });
    }
    catch (error: unknown) {
      if (avatarKey) {
        await this.storageService.deleteObject(avatarKey);
      }

      if (error instanceof UserAccountVersionConflictError) {
        return err(new UserVersionConflictError());
      }

      throw error;
    }

    if (!updatedUser) {
      if (avatarKey) {
        await this.storageService.deleteObject(avatarKey);
      }

      return err(new UserNotFoundError());
    }

    if (avatarKey && existingUser.avatar && existingUser.avatar !== avatarKey) {
      await this.storageService.deleteObject(existingUser.avatar);
    }

    this.eventEmitter.emit(
      'user.updated',
      new UserUpdatedEvent(updatedUser.id),
    );

    return ok(this.toUserSummary(updatedUser));
  }

  private buildAvatarKey(userId: string, contentType: string): string {
    return buildStorageObjectKey({
      env: resolveStorageEnvironmentSegment(process.env.NODE_ENV),
      visibility: 'public',
      path: [{ domain: 'users', id: userId }],
      collection: 'images',
      assetPath: ['original'],
      extension: resolveImageExtension(contentType),
      filename: randomUUID(),
    });
  }

  private toUserSummary(user: {
    id: string;
    version: number;
    email: { toString(): string };
    displayName?: string;
    avatar?: string;
    status: UserStatus;
  }): UserSummary {
    const avatar = user.avatar
      ? (this.storageService.getPublicUrl(user.avatar) ?? user.avatar)
      : undefined;

    return {
      id: user.id,
      version: user.version,
      email: user.email.toString(),
      ...(user.displayName !== undefined
        ? { displayName: user.displayName }
        : {}),
      ...(avatar ? { avatar } : {}),
      status: user.status,
    };
  }
}
