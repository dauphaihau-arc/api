import type { ApiErrorExample } from '~/platform/http/api-error-responses.decorator';
import {
  internalServerErrorExample,
  rateLimitErrorExample,
  validationErrorExample,
} from '~/platform/http/api-error-examples';
import { unauthorizedErrorExamples } from '~/domains/auth/api/rest/errors/auth-error-examples';

type ErrorResponses = Readonly<Record<number, readonly ApiErrorExample[]>>;

const categoryNotFoundExample: ApiErrorExample = {
  code: 'CATEGORY_NOT_FOUND',
  message: 'Category was not found',
};

/** Public error responses for the categories endpoints, selected per route. */
export const categoryErrorResponses = {
  common: {
    500: [internalServerErrorExample],
  },
  suggestions: {
    400: [
      validationErrorExample([
        { field: 'name', messages: ['name must be a string'] },
      ]),
    ],
    429: [rateLimitErrorExample],
  },
  list: {
    400: [
      validationErrorExample([
        { field: 'parent_id', messages: ['parent_id must be a UUID'] },
      ]),
    ],
  },
  attributes: {
    404: [categoryNotFoundExample],
  },
  create: {
    400: [
      validationErrorExample([
        { field: 'name', messages: ['name must be a string'] },
      ]),
    ],
    401: unauthorizedErrorExamples,
    404: [categoryNotFoundExample],
    429: [rateLimitErrorExample],
  },
  createAttribute: {
    400: [
      validationErrorExample([
        { field: 'name', messages: ['name must be a string'] },
      ]),
    ],
    401: unauthorizedErrorExamples,
    404: [categoryNotFoundExample],
    429: [rateLimitErrorExample],
  },
} satisfies Record<string, ErrorResponses>;
