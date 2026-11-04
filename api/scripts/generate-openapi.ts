import 'reflect-metadata';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import type * as AppModuleTypes from '~/bootstrap/app.module';
import {
  API_GLOBAL_PREFIX,
  API_GLOBAL_PREFIX_OPTIONS,
} from '~/platform/http/api-global-prefix';
import { createApiDocument } from '~/platform/docs/setup-api-docs';

const APP_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT_PATH = path.join(APP_ROOT, 'openapi.json');

/**
 * Placeholder configuration consumed at AppModule import time.
 *
 * Env validation runs as soon as the module is imported, and MikroORM/Redis
 * read their connection settings from the same object. Preview mode never
 * instantiates providers, so these values are never dialed; they only have to
 * parse. Existing values are always preserved.
 */
function applyPlaceholderEnv(): void {
  process.env.NODE_ENV ??= 'test';
  process.env.JWT_ACCESS_SECRET ??= 'openapi-generation-access-secret';
  process.env.JWT_REFRESH_SECRET ??= 'openapi-generation-refresh-secret';
  process.env.JWT_ACCESS_TTL ??= '15m';
  process.env.JWT_REFRESH_TTL ??= '7d';
  process.env.DATABASE_URL ??=
    'postgresql://openapi:openapi@127.0.0.1:5432/openapi_generation';
  // Catalog MongoDB settings are required unconditionally by env validation,
  // regardless of `.env` availability (the config module reads it from cwd).
  process.env.CATALOG_MONGODB_URI ??= 'mongodb://127.0.0.1:27017/openapi_generation';
  process.env.CATALOG_MONGODB_DB_NAME ??= 'openapi_generation';
  process.env.CATALOG_MONGODB_PRODUCTS_COLLECTION ??= 'products';
  process.env.CATALOG_MONGODB_PRICES_COLLECTION ??= 'prices';
  process.env.CATALOG_MONGODB_SLUGS_COLLECTION ??= 'slugs';
  process.env.CATALOG_MONGODB_SEARCH_COLLECTION ??= 'product_search';
}

interface Options {
  check: boolean;
  outPath: string;
}

function parseArgs(argv: string[]): Options {
  let check = false;
  let outPath = DEFAULT_OUTPUT_PATH;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--') {
      // pnpm forwards the argument separator verbatim for `-- <flags>`.
      continue;
    }

    if (argument === '--check') {
      check = true;
      continue;
    }

    if (argument === '--out') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--out requires a path argument.');
      }
      outPath = path.resolve(process.cwd(), value);
      index += 1;
      continue;
    }

    if (argument.startsWith('--out=')) {
      outPath = path.resolve(process.cwd(), argument.slice('--out='.length));
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return { check, outPath };
}

async function buildDocument(): Promise<OpenAPIObject> {
  applyPlaceholderEnv();

  // Dynamic loading is required: AppModule validates process.env at import
  // time, so the static module graph of this script cannot own it. `require`
  // (rather than `import()`) keeps tsconfig-paths' `~/*` resolution active.
  const requireFromScript = createRequire(__filename);
  const { AppModule } = requireFromScript('../src/bootstrap/app.module') as typeof AppModuleTypes;

  // Preview mode builds the module graph without instantiating providers, so
  // no database, Redis, Mongo, or queue connection is opened (and `init` is
  // deliberately never called).
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
    // Nest aborts the process on module graph errors by default, which would
    // hide the underlying validation problem behind a silent exit.
    abortOnError: false,
  });

  try {
    app.setGlobalPrefix(API_GLOBAL_PREFIX, API_GLOBAL_PREFIX_OPTIONS);
    return createApiDocument(app);
  }
  finally {
    await app.close();
  }
}

function serialize(document: OpenAPIObject): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

interface DiffSummary {
  firstDifferenceLine: number;
  firstDifferenceColumn: number;
  addedLines: number;
  removedLines: number;
}

function summarizeDiff(expected: string, committed: string): DiffSummary {
  const expectedLines = expected.split('\n');
  const committedLines = committed.split('\n');
  const sharedLength = Math.min(expectedLines.length, committedLines.length);

  let firstDifferenceLine = 0;
  while (
    firstDifferenceLine < sharedLength
    && expectedLines[firstDifferenceLine] === committedLines[firstDifferenceLine]
  ) {
    firstDifferenceLine += 1;
  }

  const expectedLine = expectedLines[firstDifferenceLine] ?? '';
  const committedLine = committedLines[firstDifferenceLine] ?? '';
  const columnLimit = Math.min(expectedLine.length, committedLine.length);
  let firstDifferenceColumn = 0;
  while (
    firstDifferenceColumn < columnLimit
    && expectedLine[firstDifferenceColumn] === committedLine[firstDifferenceColumn]
  ) {
    firstDifferenceColumn += 1;
  }

  const remainingExpected = new Map<string, number>();
  for (const line of expectedLines) {
    remainingExpected.set(line, (remainingExpected.get(line) ?? 0) + 1);
  }

  let addedLines = 0;
  for (const line of committedLines) {
    const remaining = remainingExpected.get(line) ?? 0;
    if (remaining > 0) {
      remainingExpected.set(line, remaining - 1);
    }
    else {
      addedLines += 1;
    }
  }

  let removedLines = 0;
  for (const remaining of remainingExpected.values()) {
    removedLines += remaining;
  }

  return {
    firstDifferenceLine: Math.min(firstDifferenceLine + 1, expectedLines.length),
    firstDifferenceColumn: firstDifferenceColumn + 1,
    addedLines,
    removedLines,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const document = await buildDocument();
  const serialized = serialize(document);

  if (!options.check) {
    await mkdir(path.dirname(options.outPath), { recursive: true });
    await writeFile(options.outPath, serialized, 'utf8');
    console.log(
      `Wrote ${path.relative(process.cwd(), options.outPath) || options.outPath} ` +
      `(${Object.keys(document.paths ?? {}).length} paths).`,
    );
    return;
  }

  let committed: string;
  try {
    committed = await readFile(options.outPath, 'utf8');
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(
        `OpenAPI spec is missing at ${options.outPath}. ` +
        'Run `pnpm spec:generate` and commit the result.',
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  if (committed === serialized) {
    console.log(
      `OpenAPI spec is up to date at ${options.outPath} ` +
      `(${Object.keys(document.paths ?? {}).length} paths).`,
    );
    return;
  }

  const summary = summarizeDiff(serialized, committed);
  console.error(
    `OpenAPI spec is stale at ${options.outPath} ` +
    `(first difference at line ${summary.firstDifferenceLine}, ` +
    `column ${summary.firstDifferenceColumn}).`,
  );
  console.error(
    `Generated document adds ${summary.addedLines} line(s) and removes ` +
    `${summary.removedLines} line(s) relative to the committed file.`,
  );
  console.error('Run `pnpm spec:generate` and commit the result.');
  process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
