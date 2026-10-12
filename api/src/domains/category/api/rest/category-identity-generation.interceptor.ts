import {
  ConflictException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { API_GLOBAL_PREFIX } from '~/platform/http/api-global-prefix';
import { CATEGORY_IDENTITY_CONTRACT_VERSION } from '../../app/category-identity-contract';

export const CATEGORY_IDENTITY_GENERATION_HEADER = 'x-category-identity-generation';
export const CATEGORY_IDENTITY_GENERATION_MISMATCH_CODE = 'CATEGORY_IDENTITY_GENERATION_MISMATCH';

/**
 * The actual category-bearing request paths, i.e. the requests that carry or
 * resolve category identity:
 *
 * - `/categories`, `/categories/suggestions`, `/categories/:id/attributes`
 *   and the category mutations (probe `/categories/contract` is exempt);
 * - `/products` (list) and `/products/facets`, whose query carries `category_id`;
 * - `/shops/:id/products*` (seller listing, draft creation, assignment).
 *
 * Everything else under `/products` — the SSE inventory stream
 * (`/products/:id/inventory/events`), product detail, reviews, review images,
 * suggestions, recommendations, view recording — is unrelated to category
 * identity and is not gated. Native `EventSource` cannot send custom headers, so
 * a broad `/products*` rule would break the inventory stream.
 */
export function isCategoryBearingRequestPath(path: string): boolean {
  const segments = path.split('/').filter(Boolean);
  const withoutPrefix = segments[0] === API_GLOBAL_PREFIX ? segments.slice(1) : segments;

  if (withoutPrefix[0] === 'categories') {
    return withoutPrefix[1] !== 'contract';
  }

  if (withoutPrefix[0] === 'products') {
    return withoutPrefix.length === 1 || withoutPrefix[1] === 'facets';
  }

  return withoutPrefix[0] === 'shops' && withoutPrefix[2] === 'products';
}

/**
 * Rejects category-bearing requests whose advertised category identity
 * generation does not match the active one. This closes the check-then-send
 * race in the client guard: even if the client's pre-flight probe passed, a
 * cutover between the probe and the request cannot slip an old generation past
 * the resolver or an assignment.
 */
@Injectable()
export class CategoryIdentityGenerationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    if (isCategoryBearingRequestPath(request.path)) {
      const generation = request.header(CATEGORY_IDENTITY_GENERATION_HEADER);

      if (generation !== CATEGORY_IDENTITY_CONTRACT_VERSION) {
        throw new ConflictException({
          code: CATEGORY_IDENTITY_GENERATION_MISMATCH_CODE,
          message: 'Category identity generation is outdated; reload required',
        });
      }
    }

    return next.handle();
  }
}
