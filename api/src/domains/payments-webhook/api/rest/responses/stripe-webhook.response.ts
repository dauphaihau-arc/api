/**
 * The webhook acknowledgement body is always an empty object; Stripe inspects
 * only the HTTP status, never response fields.
 */
export class StripeWebhookAckResponseDto {}
