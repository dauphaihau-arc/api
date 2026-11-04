import 'reflect-metadata';
import {
  mkdir, readFile, readdir, stat, writeFile, 
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import type * as ApiDocsTypes from '~/platform/docs/setup-api-docs';
import type * as ApiGlobalPrefixTypes from '~/platform/http/api-global-prefix';
import type * as AppModuleTypes from '~/bootstrap/app.module';

const APP_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT_PATH = path.join(APP_ROOT, 'openapi.json');
const SRC_ROOT = path.join(APP_ROOT, 'src');
const DIST_ROOT = path.join(APP_ROOT, 'dist');
const DIST_APP_MODULE = path.join(DIST_ROOT, 'src', 'bootstrap', 'app.module.js');
const DIST_API_GLOBAL_PREFIX = path.join(
  DIST_ROOT,
  'src',
  'platform',
  'http',
  'api-global-prefix.js',
);
const DIST_SETUP_API_DOCS = path.join(
  DIST_ROOT,
  'src',
  'platform',
  'docs',
  'setup-api-docs.js',
);

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

async function newestMtimeMs(root: string): Promise<number> {
  let newest = 0;

  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const { mtimeMs } = await stat(entryPath);
      if (mtimeMs > newest) {
        newest = mtimeMs;
      }
    }
  }

  await walk(root);
  return newest;
}

/**
 * The document must be derived from the compiled application, not from
 * `ts-node`: the `@nestjs/swagger` CLI plugin configured in `nest-cli.json`
 * only runs as part of `nest build`, so DTOs that rely on implicit inference
 * from class-validator decorators are incomplete when a TS loader boots them.
 *
 * `pnpm spec:generate` chains `pnpm build` before this script for exactly that
 * reason. When the script is invoked directly, refuse to build a document from
 * a missing or stale `dist/` instead of silently emitting the previous build.
 */
async function findBuildFreshnessProblem(): Promise<string | undefined> {
  try {
    await stat(DIST_APP_MODULE);
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    return (
      `Compiled build is missing at ${path.relative(APP_ROOT, DIST_APP_MODULE)}. ` +
      'The OpenAPI document is generated from the compiled application because ' +
      'the @nestjs/swagger CLI plugin only runs during `nest build`. ' +
      'Run `pnpm build`, or use `pnpm spec:generate` (which builds first).'
    );
  }

  const buildMtime = (await stat(DIST_APP_MODULE)).mtimeMs;
  const sourceMtime = await newestMtimeMs(SRC_ROOT);

  if (sourceMtime > buildMtime) {
    return (
      `Compiled build is stale: ${path.relative(APP_ROOT, DIST_APP_MODULE)} is older ` +
      'than the newest file under src/. Refusing to generate or verify the ' +
      'OpenAPI document from an out-of-date build. ' +
      'Run `pnpm build`, or use `pnpm spec:generate` (which builds first).'
    );
  }

  return undefined;
}

function requireCompiled<T>(modulePath: string): T {
  // Absolute path so `tsconfig-paths/register` (loaded for this script) never
  // rewrites resolution inside the compiled graph, which tsc-alias already
  // emits with relative specifiers.
  const requireFromScript = createRequire(__filename);
  return requireFromScript(modulePath) as T;
}

async function buildDocument(): Promise<OpenAPIObject> {
  applyPlaceholderEnv();

  // Dynamic loading keeps AppModule's process.env validation after the
  // placeholders above. The compiled modules are required by absolute path.
  const { AppModule } = requireCompiled<typeof AppModuleTypes>(DIST_APP_MODULE);
  const { API_GLOBAL_PREFIX, API_GLOBAL_PREFIX_OPTIONS } =
    requireCompiled<typeof ApiGlobalPrefixTypes>(DIST_API_GLOBAL_PREFIX);
  const { createApiDocument } = requireCompiled<typeof ApiDocsTypes>(DIST_SETUP_API_DOCS);

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

  const freshnessProblem = await findBuildFreshnessProblem();
  if (freshnessProblem) {
    console.error(freshnessProblem);
    process.exitCode = 1;
    return;
  }

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
