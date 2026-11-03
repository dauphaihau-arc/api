#!/usr/bin/env node
/**
 * Mock carrier service for the Arc marketplace.
 *
 * Dependency-free ESM (node: builtins only). Registers parcels, simulates a
 * handover journey and pushes every scan to the API webhook, HMAC-signed over
 * the exact JSON bytes. Also quotes rates (`POST /rates`) across the mock
 * carriers, keeps the quotes in memory, and sells them once via `POST /labels`
 * (registered parcel + base64 PDF label, no handover yet).
 *
 * Start:  just mock-carrier-up (from apps/api), or node mock-carrier-service/server.mjs
 * Env:    PORT (default 4100), HOST, CARRIER_WEBHOOK_SECRET, API_WEBHOOK_URL
 *
 * State is in-memory only: restarting drops all parcels.
 */
import { createServer as createHttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_PORT,
  DEFAULT_WEBHOOK_SECRET,
  DEFAULT_WEBHOOK_URL,
} from './src/constants.mjs';
import { HttpError, sendError } from './src/http.mjs';
import { createLabelService } from './src/labels.mjs';
import { createParcelService } from './src/parcels.mjs';
import { createRateService } from './src/rates.mjs';
import { createRouter } from './src/router.mjs';
import { createTimerScheduler } from './src/scheduler.mjs';
import { createWebhookDelivery } from './src/webhook.mjs';

export * from './src/constants.mjs';
export { HttpError } from './src/http.mjs';
export { createTimerScheduler } from './src/scheduler.mjs';
export { createLabelService } from './src/labels.mjs';
export { buildLabelPdf } from './src/pdf.mjs';
export { createRateService } from './src/rates.mjs';
export { generateTrackingNumber, isSupportedCarrier } from './src/tracking.mjs';

/**
 * Creates the in-memory service. The returned `handle(req, res)` is the HTTP
 * entry point; `close()` cancels outstanding automatic timers.
 */
export function createCarrierService(options = {}) {
  const webhookUrl = options.webhookUrl ?? process.env.API_WEBHOOK_URL ?? DEFAULT_WEBHOOK_URL;
  const webhookSecret =
    options.webhookSecret ?? process.env.CARRIER_WEBHOOK_SECRET ?? DEFAULT_WEBHOOK_SECRET;
  const now = options.now ?? (() => Date.now());
  const scheduler = options.scheduler ?? createTimerScheduler();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const logger = options.logger ?? console;
  const webhookTimeoutMs = options.webhookTimeoutMs ?? 5_000;

  const logError = (message, error) => {
    const detail = error instanceof Error ? error.message : String(error);
    if (typeof logger?.error === 'function') logger.error(`[mock-carrier] ${message}: ${detail}`);
  };

  const deliver = createWebhookDelivery({
    webhookUrl,
    webhookSecret,
    fetchImpl,
    timeoutMs: webhookTimeoutMs,
    logError,
  });
  const parcels = createParcelService({ now, scheduler, deliver });
  const rates = createRateService({ now });
  const labels = createLabelService({ rates, parcels });
  const route = createRouter({ parcels, rates, labels });

  const handle = (req, res) => {
    route(req, res).catch((error) => {
      if (error instanceof HttpError) {
        sendError(res, error.status, error.code, error.message);
        return;
      }
      logError('unhandled request error', error);
      sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected mock carrier error.');
    });
  };

  return {
    handle,
    close: parcels.close,
    rates,
    labels,
    parcelCount: parcels.count,
    labelCount: labels.count,
    config: { webhookUrl, webhookSecret },
  };
}

/** HTTP server whose lifecycle is owned by the caller (listen on port 0 in tests). */
export function createServer(options = {}) {
  const service = createCarrierService(options);
  const server = createHttpServer(service.handle);
  server.service = service;
  server.on('close', () => service.close());
  return server;
}

export async function startServer({ port, host = '127.0.0.1', ...options } = {}) {
  const server = createServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return server;
}

function resolvePort(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PORT;
  const port = Number.parseInt(raw, 10);
  return Number.isInteger(port) && port >= 0 && port <= 65_535 ? port : DEFAULT_PORT;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const port = resolvePort(process.env.PORT);
  const host = process.env.HOST ?? '127.0.0.1';
  const server = await startServer({ port, host });
  const { webhookUrl, webhookSecret } = server.service.config;
  const secretHint = webhookSecret === DEFAULT_WEBHOOK_SECRET ? ' (default)' : '';

  console.log(`[mock-carrier] listening on http://${host}:${server.address().port}`);
  console.log(`[mock-carrier] webhook -> ${webhookUrl}`);
  console.log(
    `[mock-carrier] signing secret${secretHint} loaded; in-memory state, restart drops all parcels`,
  );

  const shutdown = (signal) => {
    console.log(`[mock-carrier] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
