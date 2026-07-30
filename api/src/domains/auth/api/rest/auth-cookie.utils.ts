import type { Request, Response } from 'express';
import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions } from 'express';
import { AUTH_CONFIG } from '~/platform/config/auth.config';
import type { AuthConfig } from '~/platform/config/auth.config';
import type { AuthResponse } from '../../app/auth.types';

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(';')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .reduce<Record<string, string>>((cookies, segment) => {
      const separatorIndex = segment.indexOf('=');

      if (separatorIndex <= 0) {
        return cookies;
      }

      const name = decodeURIComponent(segment.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(segment.slice(separatorIndex + 1).trim());

      cookies[name] = value;

      return cookies;
    }, {});
}

export function extractCookieValue(
  request: Request,
  cookieName: string,
): string | null {
  return parseCookieHeader(request.headers.cookie)[cookieName] ?? null;
}

@Injectable()
export class AuthCookieService {
  constructor(@Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig) {}

  setAuthCookies(response: Response, authResponse: AuthResponse): void {
    response.cookie(
      this.authConfig.accessCookieName,
      authResponse.accessToken,
      this.buildCookieOptions(this.authConfig.jwtAccessTtlSeconds),
    );
    response.cookie(
      this.authConfig.refreshCookieName,
      authResponse.refreshToken,
      this.buildCookieOptions(this.authConfig.jwtRefreshTtlSeconds),
    );
  }

  clearAuthCookies(response: Response): void {
    const clearCookieOptions = this.buildBaseCookieOptions();

    response.clearCookie(this.authConfig.accessCookieName, clearCookieOptions);
    response.clearCookie(this.authConfig.refreshCookieName, clearCookieOptions);
  }

  extractRefreshToken(request: Request): string {
    return extractCookieValue(request, this.authConfig.refreshCookieName) ?? '';
  }

  extractAccessToken(request: Request): string | null {
    return extractCookieValue(request, this.authConfig.accessCookieName);
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
