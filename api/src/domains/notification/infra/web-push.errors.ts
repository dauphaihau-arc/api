export class WebPushDeliveryError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'WebPushDeliveryError';
  }
}

export function isWebPushSubscriptionGoneError(error: unknown): boolean {
  return (
    error instanceof WebPushDeliveryError
    && (error.statusCode === 404 || error.statusCode === 410)
  );
}
