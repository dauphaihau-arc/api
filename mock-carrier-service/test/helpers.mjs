import { createHmac } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from '../server.mjs';

export const DEFAULT_TEST_SECRET = 'carrier-webhook-test-secret';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

/** Collects every webhook POST, verifying the signature over the raw bytes. */
export async function startWebhookReceiver({ secret = DEFAULT_TEST_SECRET } = {}) {
  const deliveries = [];
  const server = createHttpServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let json = null;
      try {
        json = JSON.parse(raw);
      } catch {
        json = null;
      }
      const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
      deliveries.push({
        raw,
        json,
        headers: req.headers,
        contentType: req.headers['content-type'],
        signature: req.headers['x-carrier-signature'],
        signatureValid: req.headers['x-carrier-signature'] === expected,
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await listen(server);
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/v1/webhooks/carrier`,
    port,
    deliveries,
    codes: () => deliveries.map((entry) => entry.json?.event_code),
    close: () => closeServer(server),
  };
}

/** Deterministic replacement for setTimeout/setInterval used by the service. */
export function createFakeScheduler() {
  let nextId = 0;
  const tasks = new Map();

  return {
    schedule(fn, delayMs) {
      const handle = ++nextId;
      tasks.set(handle, { fn, delayMs });
      return handle;
    },
    cancel(handle) {
      tasks.delete(handle);
    },
    size() {
      return tasks.size;
    },
    pending() {
      return [...tasks.values()].map((task) => task.delayMs);
    },
    /** Runs every pending task, awaiting the (possibly async) callback. */
    async flush() {
      const entries = [...tasks.entries()];
      for (const [handle, task] of entries) {
        tasks.delete(handle);
        await task.fn();
      }
    },
    /** Runs only the tasks registered with this exact delay. */
    async runByDelay(delayMs) {
      const entries = [...tasks.entries()].filter(([, task]) => task.delayMs === delayMs);
      for (const [handle, task] of entries) {
        tasks.delete(handle);
        await task.fn();
      }
    },
  };
}

export function createFakeClock(startMs = Date.parse('2026-01-01T00:00:00.000Z')) {
  let current = startMs;
  return {
    now: () => current,
    advance(ms) {
      current += ms;
      return current;
    },
    iso: () => new Date(current).toISOString(),
  };
}

/** Silent logger so tests exercising the failure paths stay quiet. */
export const silentLogger = { error() {}, log() {}, warn() {} };

export async function startTestServer(options = {}) {
  const secret = options.secret ?? DEFAULT_TEST_SECRET;
  const webhook = options.webhook ?? (await startWebhookReceiver({ secret }));
  const scheduler = options.scheduler ?? createFakeScheduler();
  const clock = options.clock ?? createFakeClock();

  const server = createServer({
    webhookUrl: webhook.url,
    webhookSecret: secret,
    scheduler,
    now: clock.now,
    logger: silentLogger,
    ...options.service,
  });
  await listen(server);

  return {
    server,
    service: server.service,
    scheduler,
    clock,
    webhook,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await closeServer(server);
      if (!options.webhook) await webhook.close();
    },
  };
}

export async function request(baseUrl, method, path, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, body: json, text };
}
