interface Env {
  DRAIN_URL: string;
  OUTBOX_DRAIN_TRIGGER_SECRET: string;
  DRAIN_TIMEOUT_MS?: string;
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface DrainFailure {
  task: string;
  message: string;
}

interface PayoutRunSummary {
  runDay: string;
  [key: string]: unknown;
}

interface DrainResponse {
  ok: boolean;
  finance: number;
  checkout: number;
  inventory: number;
  refunds: number;
  payoutRun: PayoutRunSummary | null;
  failures: DrainFailure[];
  skipped: string[];
}

const DEFAULT_TIMEOUT_MS = 90000;

export default {
  async scheduled(
    _controller: unknown,
    env: Env,
    ctx: WorkerExecutionContext
  ): Promise<void> {
    ctx.waitUntil(triggerDrain(env));
  },

  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/run') {
      const result = await triggerDrain(env);
      return json(result, 200);
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return json(
        {
          ok: true,
          service: 'arc-outbox-drain-cron',
          schedule: '*/5 * * * *',
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

async function triggerDrain(env: Env): Promise<DrainResponse> {
  assertEnv(env);

  const timeoutMs = parseTimeoutMs(env.DRAIN_TIMEOUT_MS);
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetch(env.DRAIN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cron-secret': env.OUTBOX_DRAIN_TRIGGER_SECRET,
        'user-agent': 'arc-outbox-drain-cron/1.0',
      },
      signal: abortController.signal,
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `Outbox drain request failed with ${response.status}: ${truncate(responseText)}`
      );
    }

    const payload = JSON.parse(responseText) as DrainResponse;

    console.log(
      `Outbox drain finance=${payload.finance} ` +
      `checkout=${payload.checkout} inventory=${payload.inventory} ` +
      `refunds=${payload.refunds} ` +
      `payoutRun=${payload.payoutRun?.runDay ?? 'none'} ` +
      `failures=${payload.failures.length} skipped=${payload.skipped.length}`
    );

    return payload;
  }
  finally {
    clearTimeout(timeoutId);
  }
}

function assertEnv(env: Env): void {
  if (!env.DRAIN_URL?.trim()) {
    throw new Error('Missing DRAIN_URL');
  }

  if (!env.OUTBOX_DRAIN_TRIGGER_SECRET?.trim()) {
    throw new Error('Missing OUTBOX_DRAIN_TRIGGER_SECRET');
  }
}

function parseTimeoutMs(value?: string): number {
  const parsedValue = Number(value ?? String(DEFAULT_TIMEOUT_MS));

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return DEFAULT_TIMEOUT_MS;
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
