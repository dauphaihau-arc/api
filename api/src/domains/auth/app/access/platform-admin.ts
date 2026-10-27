export const PLATFORM_ADMIN_ROLE_KEYS = ['admin', 'super_admin'] as const;

export const FINANCE_ROLE_KEY = 'finance' as const;

export function isPlatformAdmin(roles: readonly string[] | undefined): boolean {
  if (!roles) {
    return false;
  }

  return roles.some((role) =>
    (PLATFORM_ADMIN_ROLE_KEYS as readonly string[]).includes(role),
  );
}

/**
 * `finance` is back-office but not a platform admin: it reaches the admin
 * portal while shop and product ownership stays with `admin`/`super_admin`.
 */
export function hasFinanceRole(roles: readonly string[] | undefined): boolean {
  if (!roles) {
    return false;
  }

  return roles.includes(FINANCE_ROLE_KEY);
}
