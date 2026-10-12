#!/usr/bin/env node
/**
 * Backend-owned launcher for the seller browser e2e suite.
 *
 * It boots this API package's own harness (a real migrated database seeded with
 * a seller, shop, category tree, attributes, shipping profile, and a fixture
 * product), waits for the harness ready line, then runs the caller's command
 * with the API origin and fixtures injected into its environment. It never
 * derives an adjacent web checkout: the web directory and command argv are
 * explicit arguments.
 *
 * Usage:
 *   pnpm e2e:seller -- --cwd /path/to/web/apps/seller -- pnpm exec playwright test [args]
 */
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const READY_PREFIX = 'SELLER_E2E_READY ';
const FAILED_PREFIX = 'SELLER_E2E_FAILED ';
const READY_TIMEOUT_MS = 300_000;
const SHUTDOWN_GRACE_MS = 10_000;

const USAGE = 'usage: pnpm e2e:seller -- --cwd <web-seller-dir> -- <command> [args...]';

const SIGNAL_CODES = { SIGINT: 130, SIGTERM: 143 };

/**
 * Parses `--cwd <dir>` followed by a `--` separator and the command argv.
 * Throws on anything malformed so the caller fails before provisioning.
 */
function parseArgs(argv) {
  const args = [...argv];

  // pnpm forwards a leading `--` separator it was given; treat it as noise.
  while (args[0] === '--') {
    args.shift();
  }

  let cwd;
  let index = 0;

  for (; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--') {
      index += 1;
      break;
    }

    if (arg === '--cwd') {
      cwd = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--cwd=')) {
      cwd = arg.slice('--cwd='.length);
      continue;
    }

    throw new Error(`unexpected argument: ${arg}`);
  }

  if (!cwd) {
    throw new Error('missing required --cwd <dir>');
  }

  const command = args.slice(index);

  if (command.length === 0) {
    throw new Error('missing command after --');
  }

  return { cwd: path.resolve(cwd), command };
}

function isDirectory(target) {
  try {
    return statSync(target).isDirectory();
  }
  catch {
    return false;
  }
}

/** Spawns a process as the leader of its own group so its whole tree is owned. */
function spawnOwned(command, args, options) {
  return spawn(command, args, {
    ...options,
    detached: process.platform !== 'win32',
  });
}

/** Kills the whole owned process group; falls back to the child on Windows. */
function killOwned(child, signal) {
  if (!child || child.pid === undefined) {
    return;
  }

  try {
    if (process.platform === 'win32') {
      child.kill(signal);
    }
    else {
      process.kill(-child.pid, signal);
    }
  }
  catch (error) {
    if (error.code !== 'ESRCH') {
      throw error;
    }
  }
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
      resolve(true);
      return;
    }

    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolve(false);
    }, timeoutMs);

    function onExit() {
      clearTimeout(timer);
      resolve(true);
    }

    child.once('exit', onExit);
  });
}

/** Graceful signal, then a bounded SIGKILL fallback for a stuck owned tree. */
async function shutdownOwned(child, graceMs = SHUTDOWN_GRACE_MS, signal = 'SIGTERM') {
  if (!child || child.pid === undefined) {
    return;
  }

  killOwned(child, signal);

  if (await waitForExit(child, graceMs)) {
    return;
  }

  killOwned(child, 'SIGKILL');
  await waitForExit(child, SHUTDOWN_GRACE_MS);
}

/**
 * Waits for the API harness ready line, forwarding its ordinary logs. The ready
 * line carries fixture credentials, so it is parsed but never echoed.
 */
function waitForReady(apiChild) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let settled = false;

    const finish = (handler, value) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      handler(value);
    };

    const timer = setTimeout(() => {
      finish(reject, new Error(`API harness did not report ready within ${READY_TIMEOUT_MS}ms`));
    }, READY_TIMEOUT_MS);

    const handleLine = (line) => {
      const trimmed = line.replace(/\r$/, '');

      if (trimmed.startsWith(READY_PREFIX)) {
        try {
          finish(resolve, JSON.parse(trimmed.slice(READY_PREFIX.length)));
        }
        catch {
          finish(reject, new Error('invalid API ready line: expected JSON origin and fixtures'));
        }
        return;
      }

      if (trimmed.startsWith(FAILED_PREFIX)) {
        finish(reject, new Error(trimmed.slice(FAILED_PREFIX.length)));
        return;
      }

      process.stdout.write(`${line}\n`);
    };

    apiChild.stdout.setEncoding('utf8');
    apiChild.stdout.on('data', (chunk) => {
      buffer += chunk;

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        handleLine(line);
      }
    });

    apiChild.stderr.setEncoding('utf8');
    apiChild.stderr.on('data', chunk => process.stderr.write(chunk));

    apiChild.on('error', error => finish(reject, error));
    apiChild.on('exit', (code, signal) => {
      finish(reject, new Error(`API harness exited before ready (code=${code}, signal=${signal})`));
    });
  });
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

function exitCodeFor(status) {
  if (status.code !== null && status.code !== undefined) {
    return status.code;
  }

  return SIGNAL_CODES[status.signal] ?? 1;
}

async function run() {
  let parsed;

  try {
    parsed = parseArgs(process.argv.slice(2));
  }
  catch (error) {
    process.stderr.write(`${error.message}\n${USAGE}\n`);
    process.exit(2);
  }

  const { cwd, command } = parsed;

  if (!isDirectory(cwd)) {
    process.stderr.write(`--cwd is not a directory: ${cwd}\n${USAGE}\n`);
    process.exit(2);
  }

  const apiChild = spawnOwned(
    process.execPath,
    [
      '-r', 'ts-node/register/transpile-only',
      '-r', 'tsconfig-paths/register',
      'test/support/seller-e2e-api.ts',
    ],
    { cwd: API_DIR, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let child;
  let finishing = false;

  // Single shutdown path shared by the normal exit and signal handling, so a
  // child that ignores a forwarded signal still cannot strand the launcher.
  const finish = async (code, signal = 'SIGTERM') => {
    if (finishing) {
      return;
    }

    finishing = true;
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    await shutdownOwned(child, SHUTDOWN_GRACE_MS, signal);
    // Database bootstrap may still be unwinding within its ready deadline.
    await shutdownOwned(apiChild, READY_TIMEOUT_MS, signal);
    process.exit(code === 0 && apiChild.exitCode !== 0 ? 1 : code);
  };

  const forwardSignal = (signal, code) => {
    if (finishing) {
      return;
    }

    void finish(code, signal);
  };
  const onSigint = () => forwardSignal('SIGINT', 130);
  const onSigterm = () => forwardSignal('SIGTERM', 143);
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  try {
    const ready = await waitForReady(apiChild);
    if (finishing) {
      return;
    }

    child = spawnOwned(command[0], command.slice(1), {
      cwd,
      env: {
        ...process.env,
        SELLER_E2E_API_ORIGIN: ready.origin,
        SELLER_E2E_FIXTURES_JSON: JSON.stringify(ready.fixtures),
      },
      stdio: 'inherit',
    });

    await finish(exitCodeFor(await waitForChild(child)));
  }
  catch (error) {
    process.stderr.write(`SELLER_E2E_LAUNCHER_FAILED ${String(error?.stack ?? error)}\n`);
    await finish(1);
  }
}

run().catch((error) => {
  process.stderr.write(`SELLER_E2E_LAUNCHER_FAILED ${String(error?.stack ?? error)}\n`);
  process.exit(1);
});
