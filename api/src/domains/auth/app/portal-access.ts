export type AuthPortal = 'storefront' | 'seller' | 'admin';

export function canAccessAuthPortal(roles: string[], portal: AuthPortal): boolean {
  if (roles.includes('admin')) {
    return portal === 'admin';
  }

  if (portal === 'storefront') {
    return roles.includes('customer') || roles.includes('seller');
  }

  if (portal === 'seller') {
    return roles.includes('seller');
  }

  return false;
}
