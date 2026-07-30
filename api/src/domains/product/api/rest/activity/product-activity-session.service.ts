import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions } from 'express';
import { AUTH_CONFIG } from '~/platform/config/auth.config';
import type { AuthConfig } from '~/platform/config/auth.config';
import { extractCookieValue } from '~/domains/auth/api/rest/auth-cookie.utils';

const PRODUCT_ACTIVITY_SESSION_COOKIE = 'productActivitySession';
const PRODUCT_ACTIVITY_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

@Injectable()
export class ProductActivitySessionService {
  private readonly cookieOptions: CookieOptions;

  constructor(@Inject(AUTH_CONFIG) authConfig: AuthConfig) {
    this.cookieOptions = {
      httpOnly: true,
      secure: authConfig.cookieSecure,
      sameSite: authConfig.cookieSameSite,
      domain: authConfig.cookieDomain,
      path: authConfig.cookiePath,
      maxAge: PRODUCT_ACTIVITY_SESSION_TTL_MS,
    };
  }

  extractSessionId(request: Request): string | null {
    return extractCookieValue(request, PRODUCT_ACTIVITY_SESSION_COOKIE);
  }

  ensureSessionId(request: Request, response: Response): string {
    const existingSessionId = this.extractSessionId(request);

    if (existingSessionId) {
      return existingSessionId;
    }

    const sessionId = randomUUID();
    response.cookie(PRODUCT_ACTIVITY_SESSION_COOKIE, sessionId, this.cookieOptions);

    return sessionId;
  }
}
