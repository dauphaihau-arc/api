interface Env {
  FX_SYNC_URL: string;
  FX_SYNC_TRIGGER_SECRET: string;
  FX_SYNC_TIMEOUT_MS?: string;
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface FxSyncResponse {
  ok: true;
  fetchedAt: string;
  pairsRequested: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
}

export default {
  async scheduled(
    _controller: unknown,
    env: Env,
    ctx: WorkerExecutionContext
  ): Promise<void> {
    ctx.waitUntil(triggerFxSync(env));
  },

  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/run') {
      const result = await triggerFxSync(env);
      return json(result, 200);
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return json(
        {
          ok: true,
          service: 'arc-fx-sync-cron',
          schedule: '0 * * * *',
        },
        200
      );
    }

    return json(
      {
        ok: false,
        error: 'Not found',
      },
      404
    );
  },
};

async function triggerFxSync(env: Env): Promise<FxSyncResponse> {
  assertEnv(env);

  const timeoutMs = parseTimeoutMs(env.FX_SYNC_TIMEOUT_MS);
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetch(env.FX_SYNC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cron-secret': env.FX_SYNC_TRIGGER_SECRET,
        'user-agent': 'arc-fx-sync-cron/1.0',
      },
      signal: abortController.signal,
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `FX sync request failed with ${response.status}: ${truncate(responseText)}`
      );
    }

    const payload = JSON.parse(responseText) as FxSyncResponse;
    return payload;
  }
  finally {
    clearTimeout(timeoutId);
  }
}

function assertEnv(env: Env): void {
  if (!env.FX_SYNC_URL?.trim()) {
    throw new Error('Missing FX_SYNC_URL');
  }

  if (!env.FX_SYNC_TRIGGER_SECRET?.trim()) {
    throw new Error('Missing FX_SYNC_TRIGGER_SECRET');
  }
}

function parseTimeoutMs(value?: string): number {
  const parsedValue = Number(value ?? '30000');

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return 30000;
  }

  return parsedValue;
}

function truncate(value: string, maxLength = 500): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}
