import type { PaymentConfig } from '~/platform/config/payment.config';

export function buildGuestOrderTrackingUrl(
  paymentConfig: PaymentConfig,
  token: string,
): string | undefined {
  if (!paymentConfig.appBaseUrl) {
    return undefined;
  }

  const url = new URL('/guest-orders', paymentConfig.appBaseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}
