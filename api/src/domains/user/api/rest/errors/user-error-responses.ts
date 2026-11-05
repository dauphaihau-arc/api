import type { ApiErrorExample } from '~/platform/http/api-error-responses.decorator';
import {
  internalServerErrorExample,
  rateLimitErrorExample,
  validationErrorExample,
} from '~/platform/http/api-error-examples';
import {
  missingRequiredPermissionsErrorExample,
  unauthorizedErrorExamples,
} from '~/domains/auth/api/rest/errors/auth-error-examples';

type ErrorResponses = Readonly<Record<number, readonly ApiErrorExample[]>>;

/**
 * Public error responses for the admin user controller. Every endpoint is
 * guarded by `JwtAuthGuard`; the permission each route requires is named by its
 * handler, and the create, update and role-replacement routes can each refuse
 * the actor or the requested state change.
 */
export const userControllerErrorResponses = {
  controller: {
    401: unauthorizedErrorExamples,
    403: [missingRequiredPermissionsErrorExample],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  list: {
    400: [
      validationErrorExample([
        { field: 'page', messages: ['page must be an integer number'] },
      ]),
    ],
  },
  detail: {
    404: [{ code: 'USER_NOT_FOUND', message: 'User was not found' }],
  },
  create: {
    400: [
      validationErrorExample([{ field: 'email', messages: ['email must be an email'] }]),
    ],
    403: [
      {
        code: 'ACTOR_NOT_ALLOWED_TO_CREATE_USERS',
        message: 'Only admins can create users',
      },
    ],
    409: [{ code: 'EMAIL_ALREADY_REGISTERED', message: 'Email is already registered' }],
  },
  update: {
    400: [
      validationErrorExample([{ field: 'version', messages: ['version must be a number'] }]),
      { code: 'AVATAR_IMAGE_INVALID_TYPE', message: 'Avatar file must be an image' },
      { code: 'AVATAR_IMAGE_EMPTY', message: 'Avatar file is empty' },
    ],
    403: [
      {
        code: 'ACTOR_NOT_ALLOWED_TO_UPDATE_USERS',
        message: 'Only admins can update users',
      },
    ],
    404: [{ code: 'USER_NOT_FOUND', message: 'User was not found' }],
    409: [{ code: 'USER_VERSION_CONFLICT', message: 'User was updated by another request. Refresh and retry with the latest version.' }],
  },
  assignRoles: {
    400: [
      validationErrorExample([{ field: 'roles', messages: ['roles must be an array'] }]),
      { code: 'UNKNOWN_ROLE', message: 'Unknown role keys: owner' },
    ],
    403: [
      {
        code: 'ACTOR_NOT_ALLOWED_TO_ASSIGN_ROLES',
        message: 'Only admins can assign user roles',
      },
    ],
    404: [{ code: 'USER_NOT_FOUND', message: 'User was not found' }],
    409: [
      {
        code: 'SELF_ROLE_CHANGE_NOT_ALLOWED',
        message: 'Actors cannot change their own roles',
      },
      {
        code: 'LAST_ADMIN_ROLE_REQUIRED',
        message: 'At least one user must keep the admin role',
      },
      {
        code: 'LAST_SUPER_ADMIN_ROLE_REQUIRED',
        message: 'At least one user must keep the super admin role',
      },
    ],
  },
} satisfies Record<string, ErrorResponses>;
