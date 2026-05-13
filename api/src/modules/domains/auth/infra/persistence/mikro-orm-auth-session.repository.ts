import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  AuthSessionRepository,
  CreateUserSessionInput
} from '../../app/ports/auth-session.repository';
import type { UserSession } from '../../domain/models/user-session';
import { CurrentUserEntity } from './entities/current-user.entity';
import { UserSessionEntity } from './entities/user-session.entity';

@Injectable()
export class MikroOrmAuthSessionRepository implements AuthSessionRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findById(id: string): Promise<UserSession | null> {
    const sessionRepository = this.entityManager
      .fork()
      .getRepository(UserSessionEntity);
    const session = await sessionRepository.findOne(
      { id },
      { populate: ['user'] }
    );

    return session ? this.toUserSession(session) : null;
  }

  async create(input: CreateUserSessionInput): Promise<UserSession> {
    const entityManager = this.entityManager.fork();
    const userRepository = entityManager.getRepository(CurrentUserEntity);
    const sessionRepository = entityManager.getRepository(UserSessionEntity);
    const user = await userRepository.findOneOrFail({ id: input.userId });
    const session = sessionRepository.create({
      user,
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: input.expiresAt,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    });

    await entityManager.persistAndFlush(session);

    return this.toUserSession(session);
  }

  async save(session: UserSession): Promise<void> {
    const entityManager = this.entityManager.fork();
    const sessionRepository = entityManager.getRepository(UserSessionEntity);
    const existingSession = await sessionRepository.findOneOrFail({
      id: session.id,
    });

    existingSession.refreshTokenHash = session.refreshTokenHash;
    existingSession.expiresAt = session.expiresAt;
    existingSession.revokedAt = session.revokedAt;
    existingSession.userAgent = session.userAgent;
    existingSession.ipAddress = session.ipAddress;

    await entityManager.flush();
  }

  private toUserSession(session: UserSessionEntity): UserSession {
    return {
      id: session.id,
      userId: session.user.id,
      refreshTokenHash: session.refreshTokenHash,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
    };
  }
}
