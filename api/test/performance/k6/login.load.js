import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const BASE_URL = __ENV.BASE_URL ?? 'http://127.0.0.1:4000/v1';
const LOGIN_PASSWORD = __ENV.LOGIN_PASSWORD ?? 'Password123!';
const scenarioFile = __ENV.SCENARIO || 'normal-traffic.json';
const scenario = JSON.parse(open(`../scenarios/${scenarioFile}`));
const AUTH_USERS_TSV_PATH = '../../../../seed-data/auth-users.tsv';
const AUTH_USERS_LOCAL_TSV_PATH = '../../../../seed-data/auth-users.local.tsv';

export const options = {
  vus: Number(__ENV.K6_VUS ?? scenario.vus ?? 5),
  duration: __ENV.K6_DURATION ?? scenario.duration ?? '30s',
  thresholds: scenario.thresholds ?? {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<750'],
    checks: ['rate>0.99'],
  },
};

function parseTsv(content) {
  const [headerLine, ...lines] = content.trim().split('\n');

  if (!headerLine) {
    return [];
  }

  const headers = headerLine.split('\t');

  return lines
    .filter(Boolean)
    .map((line) => {
      const values = line.split('\t');

      return headers.reduce((row, header, index) => {
        row[header] = values[index] ?? '';
        return row;
      }, {});
    });
}

function openIfExists(path) {
  try {
    return open(path);
  }
  catch {
    return '';
  }
}

const users = new SharedArray('seeded-auth-users', function () {
  return [
    ...parseTsv(open(AUTH_USERS_TSV_PATH)),
    ...parseTsv(openIfExists(AUTH_USERS_LOCAL_TSV_PATH)),
  ].filter((row) => row.email && row.password);
});

function forwardedIp() {
  return `203.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

export function setup() {
  if (__ENV.LOGIN_EMAIL) {
    return {
      email: __ENV.LOGIN_EMAIL,
      password: LOGIN_PASSWORD,
    };
  }

  if (!users.length) {
    throw new Error('No seeded auth users found for performance login test.');
  }

  return {
    seededUsers: users,
  };
}

export default function authLogin(data) {
  const seededUser =
    data.seededUsers[(__VU - 1 + __ITER) % data.seededUsers.length];
  const credentials = {
    email: __ENV.LOGIN_EMAIL ?? seededUser.email,
    password: __ENV.LOGIN_PASSWORD ?? seededUser.password,
  };
  const response = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      email: credentials.email,
      password: credentials.password,
      app: 'storefront',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': forwardedIp(),
      },
    },
  );

  check(response, {
    'login status is 200': (res) => res.status === 200,
    'login returns no-store cache control': (res) =>
      res.headers['Cache-Control'] === 'no-store',
    'login sets access token cookie': (res) =>
      String(res.headers['Set-Cookie'] ?? '').includes('accessToken='),
    'login sets refresh token cookie': (res) =>
      String(res.headers['Set-Cookie'] ?? '').includes('refreshToken='),
  });

  sleep(Number(scenario.sleepSeconds ?? 1));
}
