import type {
  AccessTokenPayload,
  AuthenticatedUser,
  RefreshTokenPayload
} from '../auth.types';

export abstract class AuthTokenService {
  abstract issueAccessToken(user: AuthenticatedUser): Promise<string>;
  abstract issueRefreshToken(input: {
    userId: string;
    sessionId: string;
  }): Promise<string>;
  abstract verifyRefreshToken(
    token: string,
  ): Promise<(RefreshTokenPayload & { exp: number }) | null>;
  abstract verifyAccessToken(token: string): Promise<AccessTokenPayload | null>;
}
