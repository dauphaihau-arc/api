import type { Request } from 'express';
import type { AuthConfig } from '~/platform/config/auth.config';
import type { AuthPortal } from '../../../app/portal-access';

export const AUTH_PORTAL_HEADER = 'x-auth-portal';
export const ADMIN_PORTAL_HEADER_VALUE = 'admin';
export const ADMIN_ACCESS_COOKIE_NAME = 'adminAccessToken';
export const ADMIN_REFRESH_COOKIE_NAME = 'adminRefreshToken';

export type AuthCookiePortal = 'admin' | 'legacy';

export function resolveAuthCookiePortal(request: Request): AuthCookiePortal {
  const header = request.headers[AUTH_PORTAL_HEADER];
  const value = Array.isArray(header) ? header[0] : header;

  return value === ADMIN_PORTAL_HEADER_VALUE ? 'admin' : 'legacy';
}

export function resolveAuthCookiePortalForApp(
  app: AuthPortal | undefined,
): AuthCookiePortal {
  return app === ADMIN_PORTAL_HEADER_VALUE ? 'admin' : 'legacy';
}

export function resolvePortalCookieNames(
  authConfig: Pick<AuthConfig, 'accessCookieName' | 'refreshCookieName'>,
  portal: AuthCookiePortal,
): { accessCookieName: string; refreshCookieName: string } {
  if (portal === 'admin') {
    return {
      accessCookieName: ADMIN_ACCESS_COOKIE_NAME,
      refreshCookieName: ADMIN_REFRESH_COOKIE_NAME,
    };
  }

  return {
    accessCookieName: authConfig.accessCookieName,
    refreshCookieName: authConfig.refreshCookieName,
  };
}

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
