import {
  internalServerErrorExample,
  rateLimitErrorExample,
  validationErrorExample,
} from '~/platform/http/api-error-examples';
import {
  missingRequiredPermissionsErrorExample,
  unauthorizedErrorExamples,
} from '~/domains/auth/api/rest/errors/auth-error-examples';

const shopForbidden = [
  missingRequiredPermissionsErrorExample,
  { code: 'FORBIDDEN', message: 'You do not own this shop' },
];

const shopNotFound = [{ code: 'NOT_FOUND', message: 'Shop was not found' }];

const orderNotFound = [
  { code: 'NOT_FOUND', message: 'Order was not found' },
  { code: 'ORDER_NOT_FOUND', message: 'Order was not found' },
];

/**
 * Public error response sets for the buyer order controller. It carries the
 * guards but declares no required permission, so only the 401 guard failure is
 * common.
 */
export const meOrderControllerErrorResponses = {
  controller: {
    401: unauthorizedErrorExamples,
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  list: {
    400: [validationErrorExample([{ field: 'status', messages: ['status must be a valid enum value'] }])],
  },
  detail: {
    404: [...orderNotFound],
  },
  requestCancel: {
    400: [
      validationErrorExample([{ field: 'cancel_reason', messages: ['cancel_reason must be a string'] }]),
      { code: 'BUYER_ORDER_CANCEL_NOT_ALLOWED', message: 'This order can no longer be canceled' },
      {
        code: 'BUYER_SHIPPED_ORDER_CANCEL_NOT_ALLOWED',
        message: 'Shipped orders cannot be canceled',
      },
    ],
    404: [...orderNotFound],
  },
  requestSupport: {
    400: [
      validationErrorExample([{ field: 'support_note', messages: ['support_note must be a string'] }]),
    ],
    404: [...orderNotFound],
  },
};

/** Public error response sets for the seller order controller. */
export const shopOrderControllerErrorResponses = {
  controller: {
    401: unauthorizedErrorExamples,
    403: [...shopForbidden],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  list: {
    400: [validationErrorExample([{ field: 'status', messages: ['status must be a valid enum value'] }])],
    403: [...shopForbidden],
    404: [...shopNotFound],
  },
  detail: {
    403: [...shopForbidden],
    404: [...shopNotFound, ...orderNotFound],
  },
  updateStatus: {
    400: [
      validationErrorExample([{ field: 'status', messages: ['status must be a valid enum value'] }]),
      {
        code: 'SELLER_ORDER_STATUS_UPDATE_NOT_ALLOWED',
        message: 'Sellers can only cancel orders through this endpoint',
      },
      {
        code: 'SELLER_ORDER_CANCEL_NOT_ALLOWED',
        message: 'Only pending or paid orders can be canceled by the seller',
      },
      {
        code: 'SELLER_SHIPPED_ORDER_CANCEL_NOT_ALLOWED',
        message: 'Shipped or in-transit orders cannot be canceled by the seller',
      },
    ],
    403: [...shopForbidden],
    404: [...shopNotFound, ...orderNotFound],
  },
  updateRefund: {
    400: [
      validationErrorExample([{ field: 'action', messages: ['action must be a valid enum value'] }]),
      {
        code: 'SELLER_REFUND_REQUIRES_CARD_PAYMENT',
        message: 'Only card orders support seller refund actions',
      },
      {
        code: 'SELLER_REFUND_NOT_ALLOWED',
        message: 'This order is not eligible for seller-initiated refund',
      },
      {
        code: 'SELLER_REFUND_ACTION_NOT_ALLOWED',
        message: 'This seller refund action is not allowed for the current order state',
      },
    ],
    403: [...shopForbidden],
    404: [...shopNotFound, ...orderNotFound],
  },
};

/** Public error response sets for the seller order export controller. */
export const shopOrderExportControllerErrorResponses = {
  controller: {
    401: unauthorizedErrorExamples,
    403: [...shopForbidden],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  exportCsv: {
    400: [validationErrorExample([{ field: 'format', messages: ['format must be a valid enum value'] }])],
    403: [...shopForbidden],
    404: [...shopNotFound],
  },
  startExport: {
    400: [validationErrorExample([{ field: 'format', messages: ['format must be a valid enum value'] }])],
    403: [...shopForbidden],
    404: [...shopNotFound],
  },
  exportDetail: {
    403: [...shopForbidden],
    404: [
      ...shopNotFound,
      { code: 'NOT_FOUND', message: 'Order export was not found' },
      { code: 'ORDER_EXPORT_NOT_FOUND', message: 'Order export was not found' },
    ],
  },
  downloadExport: {
    403: [...shopForbidden],
    404: [
      ...shopNotFound,
      { code: 'NOT_FOUND', message: 'Order export was not found' },
      { code: 'ORDER_EXPORT_NOT_FOUND', message: 'Order export was not found' },
    ],
    422: [{ code: 'ORDER_EXPORT_NOT_READY', message: 'Order export is not ready' }],
  },
};

/** Public error response sets for the shop dashboard controller. */
export const shopDashboardControllerErrorResponses = {
  controller: {
    401: unauthorizedErrorExamples,
    403: [...shopForbidden],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  overview: {
    400: [validationErrorExample([{ field: 'range', messages: ['range must be a valid enum value'] }])],
    404: [...shopNotFound],
  },
};

/**
 * Public error response set for the Stripe webhook controller. Throttling is
 * skipped, so no 429; the only client-fixable failure is a missing signature.
 */
export const orderWebhookControllerErrorResponses = {
  controller: {
    500: [internalServerErrorExample],
  },
  handle: {
    400: [{ code: 'BAD_REQUEST', message: 'Stripe webhook signature is missing' }],
  },
};
