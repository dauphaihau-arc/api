export const appJobName = {
  sendWelcomeEmail: 'user.send-welcome-email',
  sendPasswordResetEmail: 'user.send-password-reset-email',
  sendGuestOrderConfirmationEmail: 'order.send-guest-confirmation-email',
  generateProductImageVariants: 'product.generate-image-variants',
} as const;

export interface AppJobPayloadMap {
  [appJobName.sendWelcomeEmail]: {
    userId: string;
    email: string;
    displayName?: string;
  };
  [appJobName.sendPasswordResetEmail]: {
    userId: string;
    email: string;
    displayName?: string;
    resetUrl: string;
  };
  [appJobName.sendGuestOrderConfirmationEmail]: {
    email: string;
    orderIds: string[];
    trackingUrl: string;
    shopNames: string[];
  };
  [appJobName.generateProductImageVariants]: {
    productId: string;
  };
}

export type AppJobName = keyof AppJobPayloadMap;

export interface DispatchJobOptions {
  deduplicationKey?: string;
}

export function buildJobDeduplicationKey(
  name: AppJobName,
  ...parts: Array<string | number>
): string {
  return [name, ...parts]
    .map((part) => String(part).trim())
    .filter(Boolean)
    .map((part) => part.replace(/[^a-zA-Z0-9_-]/g, '-'))
    .join('--');
}

export const appJobDeduplicationKey = {
  sendWelcomeEmail(userId: string): string {
    return buildJobDeduplicationKey(appJobName.sendWelcomeEmail, userId);
  },
  sendGuestOrderConfirmationEmail(email: string, orderIds: string[]): string {
    return buildJobDeduplicationKey(
      appJobName.sendGuestOrderConfirmationEmail,
      email,
      orderIds.join('-')
    );
  },
  generateProductImageVariants(productId: string): string {
    return buildJobDeduplicationKey(
      appJobName.generateProductImageVariants,
      productId
    );
  },
} as const;
