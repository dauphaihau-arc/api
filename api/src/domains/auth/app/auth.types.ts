import type { UserPreferencesInput } from '~/platform/config/marketplace.config';
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
  sessionId: string;
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
  preferences?: UserPreferencesInput;
}

export interface LoginUserInput {
  email: string;
  password: string;
  app: 'storefront' | 'seller' | 'admin';
}

export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  status: UserStatus;
  sessionId: string;
  roles: string[];
  permissions: string[];
  preferences?: {
    region: string;
    language: string;
    currency: string;
  };
  shop?: {
    id: string;
    publicId?: string;
    ownerUserId: string;
    shopName: string;
    status: string;
  };
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export interface AuthUserResponse {
  user: UserProfile;
}
