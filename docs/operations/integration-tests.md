# Integration tests

Run the integration suite from `api/` with `pnpm test:int`. It uses two Jest
workers by default. Override with `pnpm test:int --maxWorkers=4`, or use
`pnpm test:int --runInBand` for serial debugging.

## Database isolation

Jest creates and migrates one unique PostgreSQL template at the start of each
run. Ordinary suites clone it into separate databases; the source is closed to
connections so tests cannot mutate it. Teardown drops the template. No template
is reused across runs, so migration changes are always applied. The test DB user
must be able to create and drop databases; `DB_HOST`, `DB_PORT`, `DB_USER`, and
`DB_PASSWORD` select the test PostgreSQL server.

Migration suites use `createTestDatabase(name, { fresh: true })` to run the
migration chain against an empty database instead of a clone. Outside this Jest
configuration, the helper retains its fresh-database behavior.

## Application isolation

App queue prefixes and BullMQ test prefixes are unique to prevent concurrent
suites sharing jobs. App suites must load `AppModule` after setting their test
environment: module configuration is captured at import time, including database
and service drivers.

## Focused variant coverage

Run `pnpm test:int --runTestsByPath test/integration/product-variant-normalization.int-spec.ts --silent`.
The variant command repository tests reuse one isolated database per suite,
reset its application tables with a single `TRUNCATE ... RESTART IDENTITY CASCADE`
before each case, and use a fresh entity manager. Migration history is retained.

## Remote inventory coverage

The remote inventory suite remains opt-in with `INVENTORY_REMOTE_E2E=1` and
requires the Go toolchain and RabbitMQ in addition to PostgreSQL and Redis.
