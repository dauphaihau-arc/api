import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Syncs the generated OpenAPI document into the publishable npm package.
 *
 * The committed `api/openapi.json` is the single source of truth; the package
 * copy is a build artifact and must never be edited by hand. This script
 * copies the bytes verbatim so the tarball cannot drift from the reviewed
 * document.
 *
 * Usage:
 *   pnpm spec:package           # write packages/api-spec/openapi.json
 *   pnpm spec:package -- --check # fail when the package copy is missing/stale
 */

const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const SOURCE_PATH = path.join(APP_ROOT, 'openapi.json');
const PACKAGE_DIR = path.join(REPO_ROOT, 'packages', 'api-spec');
const PACKAGE_PATH = path.join(PACKAGE_DIR, 'openapi.json');
const MANIFEST_PATH = path.join(PACKAGE_DIR, 'package.json');

const EXPECTED_PACKAGE_NAME = '@dauphaihau-arc/api-spec';
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

interface Manifest {
  name?: unknown;
  version?: unknown;
}

interface ValidatedManifest {
  name: string;
  version: string;
}

function parseCheckFlag(argv: string[]): boolean {
  const args = argv.filter((argument) => argument !== '--');
  const unknown = args.filter((argument) => argument !== '--check');

  if (unknown.length > 0) {
    throw new Error(`Unknown argument: ${unknown[0]}`);
  }

  return args.includes('--check');
}

async function readManifest(): Promise<ValidatedManifest> {
  let raw: string;

  try {
    raw = await readFile(MANIFEST_PATH, 'utf8');
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Package manifest is missing at ${MANIFEST_PATH}. ` +
        'Create it before syncing the spec.',
      );
    }
    throw error;
  }

  const manifest = JSON.parse(raw) as Manifest;

  if (manifest.name !== EXPECTED_PACKAGE_NAME) {
    throw new Error(
      `Package manifest must be named ${EXPECTED_PACKAGE_NAME}, ` +
      `found ${String(manifest.name)}.`,
    );
  }

  if (typeof manifest.version !== 'string' || !SEMVER_PATTERN.test(manifest.version)) {
    throw new Error(
      'Package manifest version must be a plain semver string, ' +
      `found ${String(manifest.version)}.`,
    );
  }

  return { name: manifest.name, version: manifest.version };
}

async function readSource(): Promise<string> {
  try {
    return await readFile(SOURCE_PATH, 'utf8');
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `OpenAPI spec is missing at ${SOURCE_PATH}. ` +
        'Run `pnpm spec:generate` first.',
      );
    }
    throw error;
  }
}

async function readPackageCopy(): Promise<string | undefined> {
  try {
    return await readFile(PACKAGE_PATH, 'utf8');
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const check = parseCheckFlag(process.argv.slice(2));
  const manifest = await readManifest();
  const source = await readSource();
  const relativeSource = path.relative(REPO_ROOT, SOURCE_PATH);
  const relativePackage = path.relative(REPO_ROOT, PACKAGE_PATH);

  if (!check) {
    await writeFile(PACKAGE_PATH, source, 'utf8');
    console.log(
      `Synced ${relativeSource} -> ${relativePackage} ` +
      `(${Buffer.byteLength(source)} bytes, ${manifest.name}@${manifest.version}).`,
    );
    return;
  }

  const existing = await readPackageCopy();

  if (existing === undefined) {
    console.error(
      `Package spec is missing at ${relativePackage}. ` +
      'Run `pnpm spec:package` and commit nothing (the file is gitignored).',
    );
    process.exitCode = 1;
    return;
  }

  if (existing !== source) {
    console.error(
      `Package spec at ${relativePackage} does not match ${relativeSource}. ` +
      'Run `pnpm spec:package` to regenerate it.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Package spec at ${relativePackage} matches ${relativeSource} ` +
    `(${Buffer.byteLength(source)} bytes, ${manifest.name}@${manifest.version}).`,
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
