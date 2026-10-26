import { internalServerErrorExample } from '~/platform/http/api-error-examples';

/**
 * Public error response set for the Stripe webhook controller. Throttling is
 * skipped, so no 429; the only client-fixable failure is a missing signature.
 */
export const stripeWebhookControllerErrorResponses = {
  controller: {
    500: [internalServerErrorExample],
  },
  handle: {
    400: [{ code: 'BAD_REQUEST', message: 'Stripe webhook signature is missing' }],
  },
};
