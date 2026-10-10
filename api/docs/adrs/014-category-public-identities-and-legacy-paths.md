# 014: Prepare permanent category public identities and legacy path ownership

Status: Accepted

## Context

Category APIs and existing category relationships use internal UUID primary keys. Flat canonical routing requires a durable public identity without changing those live contracts before a coordinated cutover. Historical hierarchical links must remain bound to their original category rather than a precomputed destination URL.

## Decision

Add a positive bigint public ID allocated from a PostgreSQL sequence and a persisted current slug to categories. Keep the UUID primary/foreign keys. The database enforces uniqueness, positivity, and public-ID immutability. The sequence is shared by migration backfill and future category creation; gaps are valid and IDs are not reused.

Automatic slug creation lowercases Unicode letters and numbers, removes other punctuation, normalizes whitespace, underscores, and hyphens into single hyphens, trims edge hyphens, and falls back to `category` when the result is empty. Slugs are not unique. Current API responses and requests continue using internal UUIDs until the coordinated cutover.

Store captured legacy path candidates against category UUID identity. Publish only paths with exactly one candidate into the unique alias table. Preserve ambiguous candidates in a separate conflict set and expose a cutover gate that validates an explicit resolution against both the candidate and permanent alias owner. Database triggers prevent alias/candidate mutation or deletion. Alias ownership restricts physical category deletion.

Keep the current category API and frontend identifier behavior unchanged in this additive phase. A later coordinated change must migrate all producers and consumers together, translate public IDs to internal IDs, preserve large IDs as decimal strings at JSON boundaries, and enable the flat canonical route/legacy redirect resolver.

## Consequences

- The current API still returns/accepts internal IDs until cutover; the new database identity is not yet a replacement contract.
- Current slugs are initialized on creation and are not automatically coupled to later name edits.
- Migration blocks concurrent category writes while it snapshots current names and ancestry. Schedule it with a brief category-write pause.
- Operators must inspect and resolve conflicts through `resolve_category_legacy_path(path, candidate_category_uuid)`; the function accepts only a recorded candidate and cannot replace an existing alias owner.

The migration reconstructs `/c/...` hierarchical paths using the observed historical frontend transform (`name.replaceAll(' ', '-').toLowerCase()`) for each current ancestry segment. It cannot recover query-contaminated links, historical names or parents no longer stored, or other paths no longer derivable from current category rows.

## Migration and deployment

Run the standard API migration command (`pnpm db:migration:up` from `apps/api/api`) before deploying any later public-ID routing cutover. Verify category identity backfill completeness, then inspect `category_legacy_path_cutover_gate` and its conflict candidates. Do not enable the later router while `ready` is false. This migration does not alter live API IDs, category relationships, or storefront routing. Coordinate the later contract change as one deployment, including old-client invalidation and persisted category-state handling.
