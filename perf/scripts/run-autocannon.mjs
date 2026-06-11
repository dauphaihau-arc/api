import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scenariosPath = join(__dirname, '..', 'scenarios', 'http.json');
const scenarios = JSON.parse(readFileSync(scenariosPath, 'utf8'));

const scenarioArg = process.argv[2] === '--'
  ? process.argv[3]
  : process.argv[2];
const scenarioName = scenarioArg;
const scenario = scenarioName ? scenarios[scenarioName] : null;

if (scenarioName && !scenario) {
  console.error(`Unknown perf scenario: ${scenarioName}`);
  console.error(`Available scenarios: ${Object.keys(scenarios).join(', ')}`);
  process.exit(1);
}

const method = process.env.METHOD || scenario?.method || 'GET';
const url = process.env.URL || resolveScenarioUrl(scenarioName, scenario);
const connections = process.env.C || String(scenario?.connections || 100);
const duration = process.env.D || String(scenario?.duration || 30);
const pipelining = process.env.P || String(scenario?.pipelining || 1);
const body = process.env.BODY || scenario?.body;
const headers = {
  ...(scenario?.headers || {}),
  ...extractHeadersFromEnv(process.env),
};

if (!url) {
  console.error('Missing target URL. Set URL or provide a named scenario.');
  process.exit(1);
}

const args = [
  'autocannon',
  '-m',
  method,
  '-c',
  connections,
  '-d',
  duration,
  '-p',
  pipelining,
];

for (const [name, value] of Object.entries(headers)) {
  args.push('-H', `${name}: ${value}`);
}

if (body) {
  args.push('-b', body);
}

args.push(url);

console.log(`Running: npx ${args.join(' ')}`);

const child = spawn('npx', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

function extractHeadersFromEnv(env) {
  const headers = {};

  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('H_') || !value) {
      continue;
    }

    const headerName = key
      .slice(2)
      .toLowerCase()
      .split('_')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('-');

    headers[headerName] = value;
  }

  return headers;
}

function resolveScenarioUrl(name, scenarioDefinition) {
  const scenarioUrl = scenarioDefinition?.url;

  if (!scenarioUrl) {
    return undefined;
  }

  if (name !== 'catalog-detail') {
    return scenarioUrl;
  }

  const shopSlug = process.env.SHOP_SLUG;
  const productSlug = process.env.PRODUCT_SLUG;

  if (!shopSlug && !productSlug) {
    return scenarioUrl;
  }

  if (!shopSlug || !productSlug) {
    console.error(
      'catalog-detail requires both SHOP_SLUG and PRODUCT_SLUG when overriding slugs.'
    );
    process.exit(1);
  }

  const detailUrl = new URL(scenarioUrl);
  const pathnameSegments = detailUrl.pathname.split('/');

  pathnameSegments[pathnameSegments.length - 2] = encodeURIComponent(shopSlug);
  pathnameSegments[pathnameSegments.length - 1] = encodeURIComponent(productSlug);
  detailUrl.pathname = pathnameSegments.join('/');

  return detailUrl.toString();
}
