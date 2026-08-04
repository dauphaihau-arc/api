import { canAccessAuthPortal } from './portal-access';

describe('canAccessAuthPortal', () => {
  it('allows customers into storefront only', () => {
    expect(canAccessAuthPortal(['customer'], 'storefront')).toBe(true);
    expect(canAccessAuthPortal(['customer'], 'seller')).toBe(false);
    expect(canAccessAuthPortal(['customer'], 'admin')).toBe(false);
  });

  it('allows sellers into seller portal and storefront', () => {
    expect(canAccessAuthPortal(['seller'], 'storefront')).toBe(true);
    expect(canAccessAuthPortal(['seller'], 'seller')).toBe(true);
    expect(canAccessAuthPortal(['seller'], 'admin')).toBe(false);
  });

  it('allows admin accounts into admin portal only', () => {
    expect(canAccessAuthPortal(['admin'], 'storefront')).toBe(false);
    expect(canAccessAuthPortal(['admin'], 'seller')).toBe(false);
    expect(canAccessAuthPortal(['admin'], 'admin')).toBe(true);
  });

  it('keeps admin accounts admin-only even with additional roles', () => {
    expect(canAccessAuthPortal(['admin', 'customer', 'seller'], 'storefront')).toBe(false);
    expect(canAccessAuthPortal(['admin', 'customer', 'seller'], 'seller')).toBe(false);
    expect(canAccessAuthPortal(['admin', 'customer', 'seller'], 'admin')).toBe(true);
  });
});
