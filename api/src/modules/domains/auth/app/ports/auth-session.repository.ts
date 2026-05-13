import type { UserSession } from '../../domain/models/user-session';

export interface CreateUserSessionInput {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

export abstract class AuthSessionRepository {
  abstract findById(id: string): Promise<UserSession | null>;
  abstract create(input: CreateUserSessionInput): Promise<UserSession>;
  abstract save(session: UserSession): Promise<void>;
}
