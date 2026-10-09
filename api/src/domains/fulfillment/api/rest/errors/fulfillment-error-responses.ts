import {
  internalServerErrorExample,
  rateLimitErrorExample,
  validationErrorExample,
} from '~/platform/http/api-error-examples';
import type { ApiErrorExample } from '~/platform/http/api-error-responses.decorator';
import {
  missingRequiredPermissionsErrorExample,
  unauthorizedErrorExamples,
} from '~/domains/auth/api/rest/errors/auth-error-examples';

const forbiddenOwnShopExample: ApiErrorExample = {
  code: 'FORBIDDEN',
  message: 'You do not own this shop',
};

const shopNotFoundExample: ApiErrorExample = {
  code: 'NOT_FOUND',
  message: 'Shop was not found',
};

const orderNotFoundExample: ApiErrorExample = {
  code: 'FULFILLMENT_ORDER_NOT_FOUND',
  message: 'Order was not found',
};

const notEligibleExample: ApiErrorExample = {
  code: 'ORDER_NOT_ELIGIBLE_FOR_FULFILLMENT',
  message: 'This order is not eligible for fulfillment changes',
};

const invalidQuantityExample: ApiErrorExample = {
  code: 'INVALID_FULFILLMENT_QUANTITY',
  message: 'Fulfillment quantities must be positive whole numbers',
};

const idempotencyConflictExample: ApiErrorExample = {
  code: 'CONFLICT',
  message: 'An idempotency key is required for this request.',
};

const shipmentNotFoundExample: ApiErrorExample = {
  code: 'SHIPMENT_NOT_FOUND',
  message: 'Shipment not found for this order',
};

export const shopOrderFulfillmentControllerErrorResponses = {
  common: {
    401: unauthorizedErrorExamples,
    403: [missingRequiredPermissionsErrorExample, forbiddenOwnShopExample],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  prepare: {
    400: [
      validationErrorExample([{ field: 'items', messages: ['items must be an array'] }]),
      notEligibleExample,
      { code: 'FULFILLMENT_GROUP_SELECTION_REQUIRED', message: 'This order has multiple fulfillment groups; select one' },
      { code: 'UNSUPPORTED_FULFILLMENT_METHOD', message: 'Only seller fulfillment is currently supported' },
      invalidQuantityExample,
      { code: 'SHIPMENT_ITEM_NOT_IN_GROUP', message: 'Shipment items must belong to the order item quantities in this fulfillment group' },
    ],
    404: [
      shopNotFoundExample,
      orderNotFoundExample,
      { code: 'FULFILLMENT_GROUP_NOT_FOUND', message: 'Fulfillment group not found for this order' },
    ],
    409: [
      {
        code: 'FULFILLMENT_RECONCILIATION_REQUIRED',
        message: 'This order has no fulfillment assignment yet; reconcile its remaining quantities before shipping',
      },
      { code: 'SHIPMENT_QUANTITY_EXCEEDED', message: 'Shipment quantity exceeds the group quantity still available to ship' },
      idempotencyConflictExample,
    ],
  },
  amend: {
    400: [
      validationErrorExample([{ field: 'items', messages: ['items must be an array'] }]),
      notEligibleExample,
      { code: 'FULFILLMENT_GROUP_SELECTION_REQUIRED', message: 'This order has multiple fulfillment groups; select one' },
      invalidQuantityExample,
      { code: 'SHIPMENT_ITEM_NOT_IN_GROUP', message: 'Shipment items must belong to the order item quantities in this fulfillment group' },
    ],
    404: [
      shopNotFoundExample,
      orderNotFoundExample,
      { code: 'FULFILLMENT_GROUP_NOT_FOUND', message: 'Fulfillment group not found for this order' },
      shipmentNotFoundExample,
    ],
    409: [
      { code: 'SHIPMENT_ALREADY_VOIDED', message: 'Shipment preparation is already voided' },
      { code: 'SHIPMENT_NOT_PREPARED', message: 'Shipment preparation can only be changed before dispatch' },
      {
        code: 'FULFILLMENT_RECONCILIATION_REQUIRED',
        message: 'This order has no fulfillment assignment yet; reconcile its remaining quantities before shipping',
      },
      { code: 'SHIPMENT_QUANTITY_EXCEEDED', message: 'Shipment quantity exceeds the group quantity still available to ship' },
      idempotencyConflictExample,
    ],
  },
  void: {
    400: [notEligibleExample],
    404: [shopNotFoundExample, orderNotFoundExample, shipmentNotFoundExample],
    409: [
      { code: 'SHIPMENT_ALREADY_VOIDED', message: 'Shipment preparation is already voided' },
      { code: 'SHIPMENT_NOT_PREPARED', message: 'Shipment preparation can only be changed before dispatch' },
      idempotencyConflictExample,
    ],
  },
  journey: {
    400: [
      validationErrorExample([{ field: 'status', messages: ['status must be a valid shipment status'] }]),
      notEligibleExample,
    ],
    404: [shopNotFoundExample, orderNotFoundExample, shipmentNotFoundExample],
    409: [
      { code: 'SHIPMENT_ALREADY_VOIDED', message: 'Shipment preparation is already voided' },
      { code: 'INVALID_SHIPMENT_JOURNEY_TRANSITION', message: 'Invalid shipment journey transition' },
      idempotencyConflictExample,
    ],
  },
  reconcile: {
    400: [
      validationErrorExample([{ field: 'items', messages: ['items must be an array'] }]),
      notEligibleExample,
      {
        code: 'FULFILLMENT_RECONCILIATION_INCOMPLETE',
        message: 'Reconciliation must attest the full remaining quantity of every order item',
      },
      invalidQuantityExample,
    ],
    404: [shopNotFoundExample, orderNotFoundExample],
    409: [
      { code: 'FULFILLMENT_GROUP_ALREADY_ASSIGNED', message: 'Order already has an assigned fulfillment group' },
      idempotencyConflictExample,
    ],
  },
} as const;
