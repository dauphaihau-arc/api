import type { PasswordResetToken } from '../../domain/models/password-reset-token';

export interface CreatePasswordResetTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export abstract class PasswordResetTokenRepository {
  abstract create(input: CreatePasswordResetTokenInput): Promise<PasswordResetToken>;
  abstract findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;
  abstract save(token: PasswordResetToken): Promise<void>;
  abstract invalidateActiveTokensForUser(userId: string): Promise<void>;
}
