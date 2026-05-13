import type { MarketPreferencesInput } from '~/config/marketplace.config';
import type { UserStatus } from '../domain/enums/user-status.enum';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  displayName?: string;
  status: UserStatus;
  sessionId: string;
  roles: string[];
  permissions: string[];
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  jti: string;
  type: 'refresh';
}

export interface RegisterUserInput {
  email: string;
  password: string;
  displayName?: string;
  market_preferences?: MarketPreferencesInput;
}

export interface LoginUserInput {
  email: string;
  password: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  status: UserStatus;
  sessionId: string;
  roles: string[];
  permissions: string[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}
