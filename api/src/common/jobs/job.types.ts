export const appJobName = {
  sendWelcomeEmail: 'user.send-welcome-email',
} as const;

export interface AppJobPayloadMap {
  [appJobName.sendWelcomeEmail]: {
    userId: string;
    email: string;
    displayName?: string;
  };
}

export type AppJobName = keyof AppJobPayloadMap;

export interface DispatchJobOptions {
  deduplicationKey?: string;
}
