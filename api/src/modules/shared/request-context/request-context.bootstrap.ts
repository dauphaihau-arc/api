export interface RequestContext {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  marketCode?: string;
  currency?: string;
  locale?: string;
  channel?: string;
}

export const REQUEST_CONTEXT_CLS_KEYS = {
  requestId: 'requestContext.requestId',
  ipAddress: 'requestContext.ipAddress',
  userAgent: 'requestContext.userAgent',
  marketCode: 'requestContext.marketCode',
  currency: 'requestContext.currency',
  locale: 'requestContext.locale',
  channel: 'requestContext.channel',
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
    marketCode: normalizeValue(
      request.get?.('x-market-code')
      ?? request.get?.('x-market')
      ?? getHeaderValue(request.headers, 'x-market-code')
      ?? getHeaderValue(request.headers, 'x-market')
    ),
    currency: normalizeValue(
      request.get?.('x-currency') ?? getHeaderValue(request.headers, 'x-currency')
    ),
    locale: normalizeValue(
      request.get?.('x-locale') ?? getHeaderValue(request.headers, 'x-locale')
    ),
    channel: normalizeValue(
      request.get?.('x-channel') ?? getHeaderValue(request.headers, 'x-channel')
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

  if (requestContext.marketCode) {
    cls.set(REQUEST_CONTEXT_CLS_KEYS.marketCode, requestContext.marketCode);
  }

  if (requestContext.currency) {
    cls.set(REQUEST_CONTEXT_CLS_KEYS.currency, requestContext.currency);
  }

  if (requestContext.locale) {
    cls.set(REQUEST_CONTEXT_CLS_KEYS.locale, requestContext.locale);
  }

  if (requestContext.channel) {
    cls.set(REQUEST_CONTEXT_CLS_KEYS.channel, requestContext.channel);
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
