export const appJobName = {
  sendWelcomeEmail: 'user.send-welcome-email',
  sendPasswordResetEmail: 'user.send-password-reset-email',
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
}

export type AppJobName = keyof AppJobPayloadMap;

export interface DispatchJobOptions {
  deduplicationKey?: string;
}
