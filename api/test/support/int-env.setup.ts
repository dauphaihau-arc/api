import { randomUUID } from 'node:crypto';

/**
 * Integration suites drive the API over plain HTTP with supertest agents.
 * The developer `.env` targets browsers over HTTPS, so its Secure/SameSite=None
 * auth cookies are dropped by the test client and every authenticated request
 * after registration fails with 401. Pin the cookie settings for the whole
 * integration run instead of relying on each spec to win the race against
 * config resolution.
 */
process.env.AUTH_COOKIE_SAME_SITE = 'lax';
process.env.AUTH_COOKIE_SECURE = 'false';
process.env.AUTH_COOKIE_PATH = '/';
delete process.env.AUTH_COOKIE_DOMAIN;

// Redis-backed app modules must not share a queue with another suite or dev app.
process.env.QUEUE_PREFIX = `arc-int-${randomUUID()}`;
