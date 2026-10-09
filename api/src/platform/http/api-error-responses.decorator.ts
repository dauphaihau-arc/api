import { applyDecorators } from '@nestjs/common';
import { ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '~/platform/http/api-error-response.dto';

/** A single named public error the endpoint can return at a given status. */
export interface ApiErrorExample {
  /** Stable, machine-readable error code emitted in the response envelope. */
  code: string;
  /** Human-readable error summary emitted in the response envelope. */
  message: string;
  /** Structured, error-specific context emitted under `details`. */
  details?: Record<string, unknown>;
}

/**
 * Documents endpoint-specific public error responses on a controller class
 * (applies to every method) or on a single route handler.
 *
 * Each numeric key is an HTTP status; every example becomes a named media
 * example keyed by its `code`, using the shared public error envelope
 * (`ApiErrorResponseDto`). The envelope `status_code` is derived from the
 * numeric key so authors never restate it.
 */
export function ApiErrorResponses(
  responses: Readonly<Record<number, readonly ApiErrorExample[]>>,
): ClassDecorator & MethodDecorator {
  const declarations = Object.entries(responses)
    .map(([status, examples]) => ({ status: Number(status), examples }))
    .filter(({ examples }) => examples.length > 0)
    .map(({ status, examples }) => {
      const [primary] = examples;

      return ApiResponse({
        status,
        description: primary?.message ?? `HTTP ${status} error response.`,
        content: {
          'application/json': {
            schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
            examples: Object.fromEntries(
              examples.map((example) => [
                example.code,
                {
                  summary: example.message,
                  value: {
                    status_code: status,
                    code: example.code,
                    message: example.message,
                    ...(example.details ? { details: example.details } : {}),
                  },
                },
              ]),
            ),
          },
        },
      });
    });

  return applyDecorators(...declarations);
}
