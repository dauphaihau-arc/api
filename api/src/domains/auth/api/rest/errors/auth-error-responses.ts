import {
  internalServerErrorExample,
  rateLimitErrorExample,
  validationErrorExample,
} from '~/platform/http/api-error-examples';
import { unauthorizedErrorExamples } from './auth-error-examples';

/**
 * Public error response sets for the auth controllers, keyed by route handler.
 *
 * Each set names the statuses that specific handler can return; the platform
 * examples only supply the shared payload shapes. `controller` is the
 * class-level set applied to every method.
 */
export const authControllerErrorResponses = {
  controller: {
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  register: {
    400: [validationErrorExample([{ field: 'email', messages: ['email must be an email'] }])],
    401: [{ code: 'USER_NOT_FOUND', message: 'User was not found' }],
    403: [{ code: 'INACTIVE_USER', message: 'User account is not active' }],
    409: [
      { code: 'EMAIL_ALREADY_REGISTERED', message: 'Email is already registered' },
      {
        code: 'CONFLICT',
        message: 'An idempotency key is required for this request.',
      },
    ],
  },
  login: {
    400: [validationErrorExample([{ field: 'email', messages: ['email must be an email'] }])],
    401: [
      { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      { code: 'USER_NOT_FOUND', message: 'User was not found' },
    ],
    403: [
      { code: 'INACTIVE_USER', message: 'User account is not active' },
      {
        code: 'PORTAL_ACCESS_DENIED',
        message: 'This account cannot access this portal',
      },
    ],
  },
  refresh: {
    401: [
      { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid refresh token' },
      {
        code: 'REFRESH_SESSION_NOT_FOUND',
        message: 'Refresh session was not found',
      },
      {
        code: 'REFRESH_SESSION_INACTIVE',
        message: 'Refresh session is no longer active',
      },
      {
        code: 'REFRESH_TOKEN_MISMATCH',
        message: 'Refresh token does not match session',
      },
      { code: 'USER_NOT_FOUND', message: 'User was not found' },
    ],
    403: [{ code: 'INACTIVE_USER', message: 'User account is not active' }],
  },
  forgotPassword: {
    400: [validationErrorExample([{ field: 'email', messages: ['email must be an email'] }])],
  },
  verifyToken: {
    400: [validationErrorExample([{ field: 'token', messages: ['token must be a string'] }])],
    401: [
      {
        code: 'INVALID_PASSWORD_RESET_TOKEN',
        message: 'Invalid password reset token',
      },
      {
        code: 'PASSWORD_RESET_TOKEN_EXPIRED',
        message: 'Password reset token has expired',
      },
    ],
  },
  resetPassword: {
    400: [validationErrorExample([{ field: 'password', messages: ['password is too weak'] }])],
    401: [
      {
        code: 'INVALID_PASSWORD_RESET_TOKEN',
        message: 'Invalid password reset token',
      },
      {
        code: 'PASSWORD_RESET_TOKEN_EXPIRED',
        message: 'Password reset token has expired',
      },
      { code: 'USER_NOT_FOUND', message: 'User was not found' },
    ],
    403: [
      {
        code: 'PORTAL_ACCESS_DENIED',
        message: 'This account cannot access this portal',
      },
    ],
  },
  logout: {
    401: unauthorizedErrorExamples,
  },
  me: {
    401: unauthorizedErrorExamples,
  },
};

export const meControllerErrorResponses = {
  controller: {
    401: unauthorizedErrorExamples,
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  updateMe: {
    400: [
      validationErrorExample([
        { field: 'preferences', messages: ['preferences must be an object'] },
      ]),
    ],
  },
};

export const sellerAuthControllerErrorResponses = {
  controller: {
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  register: {
    400: [
      validationErrorExample([{ field: 'email', messages: ['email must be an email'] }]),
      { code: 'SHOP_SLUG_RESERVED', message: 'Shop slug is reserved' },
    ],
    401: [{ code: 'USER_NOT_FOUND', message: 'User was not found' }],
    403: [{ code: 'INACTIVE_USER', message: 'User account is not active' }],
    409: [
      { code: 'EMAIL_ALREADY_REGISTERED', message: 'Email is already registered' },
      { code: 'SHOP_NAME_ALREADY_TAKEN', message: 'Shop name is already taken' },
      { code: 'SHOP_SLUG_ALREADY_TAKEN', message: 'Shop slug is already taken' },
      {
        code: 'CONFLICT',
        message: 'An idempotency key is required for this request.',
      },
    ],
  },
};
