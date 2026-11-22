export const BUYER_ROLE_KEY = 'customer' as const;

/**
 * A Buyer Account holds only customer access. Any seller or back-office role
 * makes the account non-buyer for outbound-message language, even when the
 * customer role is also present.
 */
export function isBuyerAccount(roles: readonly string[]): boolean {
  return roles.length > 0 && roles.every((role) => role === BUYER_ROLE_KEY);
}
