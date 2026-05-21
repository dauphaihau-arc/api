import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions } from 'express';
import { AUTH_CONFIG } from '~/config/auth.config';
import type { AuthConfig } from '~/config/auth.config';
import { CART_CONFIG } from '~/config/cart.config';
import type { CartConfig } from '~/config/cart.config';
import { extractCookieValue } from '~/modules/domains/auth/api/rest/auth-cookie.utils';

const GUEST_CART_SESSION_COOKIE = 'guestCartSession';

@Injectable()
export class GuestCartSessionService {
  private readonly cookieOptions: CookieOptions;

  constructor(
    @Inject(AUTH_CONFIG) authConfig: AuthConfig,
    @Inject(CART_CONFIG) cartConfig: CartConfig
  ) {
    this.cookieOptions = {
      httpOnly: true,
      secure: authConfig.cookieSecure,
      sameSite: authConfig.cookieSameSite,
      domain: authConfig.cookieDomain,
      path: authConfig.cookiePath,
      maxAge: cartConfig.guestCartSessionTtlMs,
    };
  }

  extractSessionId(request: Request): string | null {
    return extractCookieValue(request, GUEST_CART_SESSION_COOKIE);
  }

  ensureSessionId(request: Request, response: Response): string {
    const existingSessionId = this.extractSessionId(request);

    if (existingSessionId) {
      return existingSessionId;
    }

    const sessionId = randomUUID();
    response.cookie(GUEST_CART_SESSION_COOKIE, sessionId, this.cookieOptions);

    return sessionId;
  }

  clearSession(response: Response): void {
    response.clearCookie(GUEST_CART_SESSION_COOKIE, {
      httpOnly: true,
      secure: this.cookieOptions.secure,
      sameSite: this.cookieOptions.sameSite,
      domain: this.cookieOptions.domain,
      path: this.cookieOptions.path,
    });
  }
}
