export interface RequestContext {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export const REQUEST_CONTEXT_CLS_KEYS = {
  requestId: 'requestContext.requestId',
  ipAddress: 'requestContext.ipAddress',
  userAgent: 'requestContext.userAgent',
  actorId: 'requestContext.actorId',
  actorEmail: 'requestContext.actorEmail',
  sessionId: 'requestContext.sessionId',
} as const;

export type RequestLike = {
  ip?: string;
  get?: (name: string) => string | undefined;
  headers?: Record<string, string | string[] | undefined>;
};

type ClsStore = {
  getId(): string | undefined;
  set(key: string, value: unknown): void;
};

export function extractRequestContext(request: RequestLike): RequestContext {
  return {
    requestId: normalizeValue(
      request.get?.('x-request-id') ?? getHeaderValue(request.headers, 'x-request-id')
    ),
    ipAddress: normalizeValue(request.ip),
    userAgent: normalizeValue(
      request.get?.('user-agent') ?? getHeaderValue(request.headers, 'user-agent')
    ),
  };
}

export function initializeRequestContextStore(
  cls: ClsStore,
  request: RequestLike
): void {
  const requestContext = extractRequestContext(request);

  cls.set(
    REQUEST_CONTEXT_CLS_KEYS.requestId,
    requestContext.requestId ?? cls.getId()
  );

  if (requestContext.ipAddress) {
    cls.set(REQUEST_CONTEXT_CLS_KEYS.ipAddress, requestContext.ipAddress);
  }

  if (requestContext.userAgent) {
    cls.set(REQUEST_CONTEXT_CLS_KEYS.userAgent, requestContext.userAgent);
  }
}

function getHeaderValue(
  headers: RequestLike['headers'],
  name: string
): string | undefined {
  const headerValue = headers?.[name];

  if (Array.isArray(headerValue)) {
    return headerValue[0];
  }

  return headerValue;
}

function normalizeValue(value?: string): string | undefined {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : undefined;
}
