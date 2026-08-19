#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

const EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'coverage']);

const technicalPackagesForbiddenInDomain = [
  '@aws-sdk/',
  '@mikro-orm/',
  '@nestjs/',
  '@socket.io/',
  'amqplib',
  'bullmq',
  'express',
  'ioredis',
  'mongodb',
  'openai',
  'pg',
  'redis',
  'sharp',
  'socket.io',
  'stripe',
  'web-push',
];

const importPattern =
  /(?:import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?|export\s+(?:type\s+)?[\s\S]*?\s+from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g;

const violations = [];

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        files.push(...walk(path.join(dir, entry.name)));
      }
      continue;
    }

    if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files;
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function relativeFile(file) {
  return toPosix(path.relative(ROOT, file));
}

function extractImports(source) {
  const imports = [];
  let match;

  while ((match = importPattern.exec(source)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

function resolveImport(file, specifier) {
  if (specifier.startsWith('~/')) {
    return toPosix(path.join('src', specifier.slice(2)));
  }

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const fromDir = path.dirname(relativeFile(file));
    return toPosix(path.normalize(path.join(fromDir, specifier)));
  }

  return specifier;
}

function addViolation(file, specifier, rule, detail) {
  violations.push({
    file: relativeFile(file),
    specifier,
    rule,
    detail,
  });
}

function isDomainLayerFile(file, layer) {
  return relativeFile(file).includes(`/domains/`) && relativeFile(file).includes(`/${layer}/`);
}

function importedDomainLayer(resolvedSpecifier) {
  const match = resolvedSpecifier.match(/(?:^|\/)domains\/[^/]+\/(api|app|domain|infra)(?:\/|$)/);
  return match?.[1] ?? null;
}

function checkDomainLayer(file, specifier, resolvedSpecifier) {
  if (!isDomainLayerFile(file, 'domain')) {
    return;
  }

  const forbiddenPackage = technicalPackagesForbiddenInDomain.find((prefix) => specifier === prefix || specifier.startsWith(prefix));

  if (forbiddenPackage) {
    addViolation(
      file,
      specifier,
      'domain-layer-is-pure',
      `domain/ files must not import technical package "${forbiddenPackage}".`,
    );
  }

  const layer = importedDomainLayer(resolvedSpecifier);

  if (layer === 'api' || layer === 'app' || layer === 'infra') {
    addViolation(
      file,
      specifier,
      'domain-layer-does-not-depend-on-outer-layers',
      `domain/ files must not import another domain ${layer}/ layer.`,
    );
  }
}

function checkSharedLayer(file, specifier, resolvedSpecifier) {
  if (!relativeFile(file).startsWith('src/shared/')) {
    return;
  }

  if (/(^|\/)domains\//.test(resolvedSpecifier)) {
    addViolation(
      file,
      specifier,
      'shared-does-not-depend-on-domains',
      'shared/ must stay generic and must not import domain modules.',
    );
  }
}

function checkIntegrationsLayer(file, specifier, resolvedSpecifier) {
  if (!relativeFile(file).startsWith('src/integrations/')) {
    return;
  }

  if (/(^|\/)domains\//.test(resolvedSpecifier)) {
    addViolation(
      file,
      specifier,
      'integrations-do-not-depend-on-domains',
      'integrations/ must not own business decisions or import domain modules.',
    );
  }
}

for (const file of walk(SRC)) {
  const source = readFileSync(file, 'utf8');
  const imports = extractImports(source);

  for (const specifier of imports) {
    const resolvedSpecifier = resolveImport(file, specifier);

    checkDomainLayer(file, specifier, resolvedSpecifier);
    checkSharedLayer(file, specifier, resolvedSpecifier);
    checkIntegrationsLayer(file, specifier, resolvedSpecifier);
  }
}

if (violations.length > 0) {
  console.error('Architecture violations found:\n');

  for (const violation of violations) {
    console.error(`${violation.file}`);
    console.error(`  import: ${violation.specifier}`);
    console.error(`  rule:   ${violation.rule}`);
    console.error(`  detail: ${violation.detail}\n`);
  }

  process.exit(1);
}

console.log('Architecture checks passed');
