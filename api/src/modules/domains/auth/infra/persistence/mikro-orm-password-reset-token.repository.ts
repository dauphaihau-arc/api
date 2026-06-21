import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  CreatePasswordResetTokenInput,
  PasswordResetTokenRepository,
} from '../../app/ports/password-reset-token.repository';
import type { PasswordResetToken } from '../../domain/models/password-reset-token';
import { CurrentUserEntity } from './entities/current-user.entity';
import { PasswordResetTokenEntity } from './entities/password-reset-token.entity';

@Injectable()
export class MikroOrmPasswordResetTokenRepository
implements PasswordResetTokenRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async create(
    input: CreatePasswordResetTokenInput,
  ): Promise<PasswordResetToken> {
    const entityManager = this.entityManager.fork();
    const userRepository = entityManager.getRepository(CurrentUserEntity);
    const tokenRepository = entityManager.getRepository(PasswordResetTokenEntity);
    const user = await userRepository.findOneOrFail({ id: input.userId });
    const token = tokenRepository.create({
      user,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    });

    await entityManager.persistAndFlush(token);

    return this.toPasswordResetToken(token);
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const tokenRepository = this.entityManager
      .fork()
      .getRepository(PasswordResetTokenEntity);
    const token = await tokenRepository.findOne(
      { tokenHash },
      { populate: ['user'] },
    );

    return token ? this.toPasswordResetToken(token) : null;
  }

  async save(token: PasswordResetToken): Promise<void> {
    const entityManager = this.entityManager.fork();
    const tokenRepository = entityManager.getRepository(PasswordResetTokenEntity);
    const existingToken = await tokenRepository.findOneOrFail({ id: token.id });

    existingToken.expiresAt = token.expiresAt;
    existingToken.usedAt = token.usedAt;

    await entityManager.flush();
  }

  async invalidateActiveTokensForUser(userId: string): Promise<void> {
    const entityManager = this.entityManager.fork();
    const tokenRepository = entityManager.getRepository(PasswordResetTokenEntity);
    const activeTokens = await tokenRepository.find({
      user: userId,
      usedAt: null,
    });

    if (activeTokens.length === 0) {
      return;
    }

    const usedAt = new Date();

    for (const token of activeTokens) {
      token.usedAt = usedAt;
    }

    await entityManager.flush();
  }

  private toPasswordResetToken(
    token: PasswordResetTokenEntity,
  ): PasswordResetToken {
    return {
      id: token.id,
      userId: token.user.id,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt,
    };
  }
}
