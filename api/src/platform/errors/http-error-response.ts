import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Public JSON error contract shared by every REST endpoint.
 *
 * `status_code`, `code` and `message` are always present. `request_id` is
 * present when the request could be correlated and `details` is present when
 * the owning transport mapper supplied structured context. No other top-level
 * keys are ever emitted; legacy fields (`statusCode`, `error`, `timestamp`,
 * `path`) and mapper extras live under `details` or are dropped.
 */
export interface PublicHttpErrorResponse {
  status_code: number;
  code: string;
  message: string;
  request_id?: string;
  details?: Record<string, unknown>;
}

/**
 * Generic framework codes for exceptions that carry no explicit semantic code
 * (native Nest exceptions, guards, pipes, missing routes). Stable business
 * codes supplied by a transport mapper always win.
 */
const FALLBACK_ERROR_CODES: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.PAYMENT_REQUIRED]: 'PAYMENT_REQUIRED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
  [HttpStatus.NOT_ACCEPTABLE]: 'NOT_ACCEPTABLE',
  [HttpStatus.REQUEST_TIMEOUT]: 'REQUEST_TIMEOUT',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.GONE]: 'GONE',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMIT_EXCEEDED',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
  [HttpStatus.NOT_IMPLEMENTED]: 'NOT_IMPLEMENTED',
  [HttpStatus.BAD_GATEWAY]: 'BAD_GATEWAY',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
  [HttpStatus.GATEWAY_TIMEOUT]: 'GATEWAY_TIMEOUT',
};

const DEFAULT_STATUS_MESSAGES: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'Method Not Allowed',
  [HttpStatus.NOT_ACCEPTABLE]: 'Not Acceptable',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.GONE]: 'Gone',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Payload Too Large',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'Unsupported Media Type',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal server error',
  [HttpStatus.NOT_IMPLEMENTED]: 'Not Implemented',
  [HttpStatus.BAD_GATEWAY]: 'Bad Gateway',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
  [HttpStatus.GATEWAY_TIMEOUT]: 'Gateway Timeout',
};

export function fallbackHttpErrorCode(statusCode: number): string {
  return FALLBACK_ERROR_CODES[statusCode] ?? `HTTP_${statusCode}`;
}

export function defaultHttpErrorMessage(statusCode: number): string {
  return (
    DEFAULT_STATUS_MESSAGES[statusCode] ??
    (statusCode >= 500 ? 'Internal server error' : 'Request failed')
  );
}

/**
 * Builds the public error body from an arbitrary thrown value.
 *
 * The response status is always the filter-resolved `statusCode`; mapper
 * payloads can only contribute `code`, `message` and `details`, so reserved
 * metadata (`status_code`, `request_id`) can never be overridden by an
 * exception payload.
 *
 * 5xx responses are redacted: status 500 always renders the generic
 * `INTERNAL_SERVER_ERROR` body, and 502/503/504 keep an authored message and
 * `details` only when the mapper supplied an explicit public `code`.
 */
export function buildPublicHttpErrorResponse(
  exception: unknown,
  statusCode: number,
  requestId?: string,
): PublicHttpErrorResponse {
  const body: PublicHttpErrorResponse = {
    status_code: statusCode,
    code: fallbackHttpErrorCode(statusCode),
    message: defaultHttpErrorMessage(statusCode),
  };

  if (requestId) {
    body.request_id = requestId;
  }

  if (!(exception instanceof HttpException)) {
    return body;
  }

  if (statusCode >= 500) {
    // 5xx is a server-side failure. Only 502/503/504 may carry an authored
    // public payload, and only when the mapper supplied an explicit code;
    // everything else is redacted to the generic status code and message with
    // no details, so internal diagnostics never reach the client.
    if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
      const response = exception.getResponse();

      if (response && typeof response === 'object' && !Array.isArray(response)) {
        const payload = response as Record<string, unknown>;
        const code = typeof payload.code === 'string' ? payload.code.trim() : '';

        if (code.length > 0) {
          body.code = code;

          const message = normalizeMessage(payload.message) ??
            normalizeMessage(exception.message);
          if (message !== undefined) {
            body.message = message;
          }

          if (
            payload.details
            && typeof payload.details === 'object'
            && !Array.isArray(payload.details)
            && Object.keys(payload.details as Record<string, unknown>).length > 0
          ) {
            body.details = payload.details as Record<string, unknown>;
          }
        }
      }
    }

    return body;
  }

  const response = exception.getResponse();

  if (typeof response === 'string') {
    const message = normalizeMessage(response);

    if (message !== undefined) {
      body.message = message;
    }

    return body;
  }

  if (Array.isArray(response)) {
    const message = normalizeMessage(response);

    if (message !== undefined) {
      body.message = message;
    }

    return body;
  }

  if (response && typeof response === 'object') {
    const payload = response as Record<string, unknown>;

    if (typeof payload.code === 'string' && payload.code.trim().length > 0) {
      body.code = payload.code.trim();
    }

    const message = normalizeMessage(payload.message);
    if (message !== undefined) {
      body.message = message;
    }
    else {
      const fallbackMessage = normalizeMessage(exception.message);
      if (fallbackMessage !== undefined) {
        body.message = fallbackMessage;
      }
    }

    if (
      payload.details
      && typeof payload.details === 'object'
      && !Array.isArray(payload.details)
      && Object.keys(payload.details as Record<string, unknown>).length > 0
    ) {
      body.details = payload.details as Record<string, unknown>;
    }

    return body;
  }

  const fallbackMessage = normalizeMessage(exception.message);
  if (fallbackMessage !== undefined) {
    body.message = fallbackMessage;
  }

  return body;
}

function normalizeMessage(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.length > 0 ? value : undefined;
  }

  if (Array.isArray(value)) {
    const parts = value.filter(
      (part): part is string => typeof part === 'string' && part.length > 0,
    );

    return parts.length > 0 ? parts.join('; ') : undefined;
  }

  return undefined;
}
