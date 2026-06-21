# Seed Conventions

This directory contains demo and reference seeders for the API database.

Use these rules when adding or changing seed files.

## Goals

- Keep seed runs deterministic.
- Keep seed runs observable.
- Keep seed runs fast enough for local development.
- Prefer idempotent upsert-style behavior unless a seed explicitly rebuilds data.

## Logging

- Every non-trivial seeder should emit internal progress logs.
- Include total counts at the start of a seeder when practical.
- Include elapsed time in progress logs for loops or batch work.
- Prefer checkpoint logs over per-row logs.
- Good checkpoint frequency:
  - every `10` items for small fixed loops
  - every `20%` of total work for variable loops
  - every batch flush for large generated datasets

Example:

```ts
console.log(`[seed][products] Upserting ${totalProducts} products`);
console.log(
  `[seed][products] Processed ${index + 1}/${totalProducts} in ${formatDuration(Date.now() - startedAt)}`
);
```

## Performance Rules

- Do not call `persistAndFlush()` inside loops.
- Avoid repeated `findOne()` calls in hot loops when data can be preloaded once.
- If a loop iterates over seed rows, assume `findOne()` inside that loop is a code smell unless the dataset is tiny and fixed.
- Prefer preload maps keyed by stable identifiers such as:
  - `email`
  - `slug`
  - `shopSlug::productSlug`
  - `shopSlug::title`
  - `shopSlug::code`
  - `fromCurrency::toCurrency`
- Prefer `nativeDelete()` for destructive reset steps on child tables.
- Prefer preloading existing rows with a single `find()` and then indexing them in memory.
- Prefer one `flush()` per logical item or batch, not several flushes inside a single item workflow.
- Use batch flushes for high-volume generated data.
- Call `orm.em.fork()` from seed entrypoints and keep work inside that forked EM.
- Keep MikroORM debug logging off for seed runs.

## When To Use Native Operations

- Use `nativeDelete()` when clearing related rows before rebuilding them.
- Consider `nativeInsertMany()` for large append-only seed data where entity lifecycle behavior is not needed.
- For very large datasets, prefer batching first. Move to `COPY` only if batching is still too slow.

## Product Seeder Rules

- Cache category path lookups.
- Preload existing products by `shop + slug`.
- Avoid extra flushes between:
  - product
  - images
  - attributes
  - variants
  - inventory
  - shipping
- Flush once after the full per-product update when possible.

## Auth Seeder Rules

- Seed mode may use lower bcrypt rounds than runtime auth.
- Memoize password hashes by raw seed password when many users share the same seed password.
- Keep this optimization seed-only. Do not copy it into runtime auth flows.

## Review And Order Seed Rules

- Generated high-volume seeders should log by batch boundaries.
- If a seeder rebuilds derived data, log both:
  - record creation progress
  - aggregate recalculation progress

## Before Opening A PR

- Run `git diff --check`.
- Run the relevant seed command and inspect the logs for:
  - visible forward progress
  - no long silent phases
  - suspiciously linear per-row stalls
- If a phase is slow, decide whether the bottleneck is:
  - repeated reads
  - repeated flushes
  - hashing or CPU-bound work
  - aggregate recalculation

## Quick Review Checklist

- Does the seeder log a start count?
- Does the seeder log progress for any loop that can run longer than about `1s`?
- Does the progress log include elapsed time?
- Does the seeder preload existing rows instead of calling `findOne()` inside the main seed loop?
- Does the seeder use `nativeDelete()` for reset/rebuild child data where safe?
- Does the seeder flush once per batch or logical item instead of several times in the same workflow?
- If passwords are seeded, is any lower-cost or memoized hashing optimization kept seed-only?

## Preferred Pattern

1. Load seed input.
2. Preload existing rows needed for lookups.
3. Build maps for hot-path access.
4. Apply in-memory updates or create entities.
5. Flush once per batch or logical item.
6. Log elapsed progress throughout the phase.
