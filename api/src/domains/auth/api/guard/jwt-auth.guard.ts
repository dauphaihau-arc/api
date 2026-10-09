import {
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AUTH_CONFIG } from '~/platform/config/auth.config';
import type { AuthConfig } from '~/platform/config/auth.config';
import { extractCookieValue } from '../rest/cookies/auth-cookie.utils';

export type AuthTokenErrorCode =
  | 'ACCESS_TOKEN_EXPIRED'
  | 'ACCESS_TOKEN_MISSING'
  | 'ACCESS_TOKEN_INVALID'
  | 'AUTH_REQUIRED';

const AUTH_TOKEN_ERROR_MESSAGES: Record<AuthTokenErrorCode, string> = {
  ACCESS_TOKEN_EXPIRED: 'Access token has expired',
  ACCESS_TOKEN_MISSING: 'Access token is missing',
  ACCESS_TOKEN_INVALID: 'Access token is invalid',
  AUTH_REQUIRED: 'Authentication is required',
};

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(@Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig) {
    super();
  }

  getRequest(context: ExecutionContext): Request {
    return context.switchToHttp().getRequest<Request>();
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err) {
      throw err;
    }

    if (user) {
      return user;
    }

    const code = this.classifyTokenError(info, this.getRequest(context));

    throw new UnauthorizedException({
      message: AUTH_TOKEN_ERROR_MESSAGES[code],
      code,
    });
  }

  private classifyTokenError(
    info: unknown,
    request: Request,
  ): AuthTokenErrorCode {
    const hasAccessToken = Boolean(
      extractCookieValue(request, this.authConfig.accessCookieName),
    );
    const hasRefreshToken = Boolean(
      extractCookieValue(request, this.authConfig.refreshCookieName),
    );

    if (info instanceof Error && info.name === 'TokenExpiredError') {
      return hasRefreshToken ? 'ACCESS_TOKEN_EXPIRED' : 'ACCESS_TOKEN_INVALID';
    }

    if (!hasAccessToken) {
      return hasRefreshToken ? 'ACCESS_TOKEN_MISSING' : 'AUTH_REQUIRED';
    }

    return 'ACCESS_TOKEN_INVALID';
  }
}
