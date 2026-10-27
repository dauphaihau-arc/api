import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { CookieOptions } from 'express';
import { AUTH_CONFIG } from '~/platform/config/auth.config';
import type { AuthConfig } from '~/platform/config/auth.config';
import type { AuthResponse } from '../../../app/auth.types';
import {
  extractCookieValue,
  resolvePortalCookieNames,
} from './auth-cookie.utils';
import type { AuthCookiePortal } from './auth-cookie.utils';

@Injectable()
export class AuthCookieService {
  constructor(@Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig) {}

  setAuthCookies(
    response: Response,
    authResponse: AuthResponse,
    portal: AuthCookiePortal,
  ): void {
    const { accessCookieName, refreshCookieName } =
      this.resolveCookieNames(portal);

    response.cookie(
      accessCookieName,
      authResponse.accessToken,
      this.buildCookieOptions(this.authConfig.jwtAccessTtlSeconds),
    );
    response.cookie(
      refreshCookieName,
      authResponse.refreshToken,
      this.buildCookieOptions(this.authConfig.jwtRefreshTtlSeconds),
    );
  }

  clearAuthCookies(response: Response, portal: AuthCookiePortal): void {
    const { accessCookieName, refreshCookieName } =
      this.resolveCookieNames(portal);
    const clearCookieOptions = this.buildBaseCookieOptions();

    response.clearCookie(accessCookieName, clearCookieOptions);
    response.clearCookie(refreshCookieName, clearCookieOptions);
  }

  extractRefreshToken(request: Request, portal: AuthCookiePortal): string {
    return (
      extractCookieValue(
        request,
        this.resolveCookieNames(portal).refreshCookieName,
      ) ?? ''
    );
  }

  extractAccessToken(
    request: Request,
    portal: AuthCookiePortal,
  ): string | null {
    return extractCookieValue(
      request,
      this.resolveCookieNames(portal).accessCookieName,
    );
  }

  resolveCookieNames(portal: AuthCookiePortal): {
    accessCookieName: string;
    refreshCookieName: string;
  } {
    return resolvePortalCookieNames(this.authConfig, portal);
  }

  private buildCookieOptions(maxAgeSeconds: number): CookieOptions {
    return {
      ...this.buildBaseCookieOptions(),
      maxAge: maxAgeSeconds * 1000,
    };
  }

  private buildBaseCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.authConfig.cookieSecure,
      sameSite: this.authConfig.cookieSameSite,
      domain: this.authConfig.cookieDomain,
      path: this.authConfig.cookiePath,
    };
  }
}
