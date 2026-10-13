# 014: Separate category public identity from persistence and URL ancestry

Status: Accepted

## Context

Category APIs and existing category relationships use internal UUID primary keys. Flat canonical routing requires a durable public identity without changing those live contracts before a coordinated cutover. Historical hierarchical links must remain bound to their original category rather than a precomputed destination URL.

## Decision: additive preparation

Add a positive bigint public ID allocated from a PostgreSQL sequence and a persisted current slug to categories. Keep the UUID primary/foreign keys. The database enforces uniqueness, positivity, and public-ID immutability. The sequence is shared by migration backfill and future category creation; gaps are valid and IDs are not reused.

Automatic slug creation lowercases Unicode letters and numbers, removes other punctuation, normalizes whitespace, underscores, and hyphens into single hyphens, trims edge hyphens, and falls back to `category` when the result is empty. Slugs are not unique. During additive preparation only, API responses and requests continue using internal UUIDs; the implemented cutover below replaces that boundary contract.

Store captured legacy path candidates against category UUID identity. Publish only paths with exactly one candidate into the unique alias table. Preserve ambiguous candidates in a separate conflict set and expose a cutover gate that validates an explicit resolution against both the candidate and permanent alias owner. Database triggers prevent alias/candidate mutation or deletion. Alias ownership restricts physical category deletion.

Keep the current category API and frontend identifier behavior unchanged in this additive phase. A later coordinated change must migrate all producers and consumers together, translate public IDs to internal IDs, preserve large IDs as decimal strings at JSON boundaries, and enable the flat canonical route/legacy redirect resolver.

## Consequences

- Additive preparation preserves internal-ID API semantics; activation switches all category-bearing boundaries together, without compatibility fallbacks.
- Current slugs are initialized on creation and are not automatically coupled to later name edits.
- Migration blocks concurrent category writes while it snapshots current names and ancestry. Schedule it with a brief category-write pause.
- Operators must inspect and resolve conflicts through `resolve_category_legacy_path(path, candidate_category_uuid)`; the function accepts only a recorded candidate and cannot replace an existing alias owner.

The migration reconstructs `/c/...` hierarchical paths using the observed historical frontend transform (`name.replaceAll(' ', '-').toLowerCase()`) for each current ancestry segment. It cannot recover query-contaminated links, historical names or parents no longer stored, or other paths no longer derivable from current category rows.

## Cutover: public identity at the API boundary

Status: Implemented.

The coordinated semantic cutover replaces internal category UUIDs with public
decimal strings at every category-bearing API boundary while keeping internal
primary and foreign keys unchanged:

- `id`, `parent_id`, `category_id`, and category-valued nested references
  (`category_path[].id`, suggestions, selectors) serialize the public identity.
- Request identifiers are validated as positive decimal strings; internal UUIDs
  are rejected rather than reinterpreted.
- `CategoryRepository.findByPublicId` resolves public identity to internal
  identity and never falls back to internal-id lookup: internal category UUIDs
  are rejected, so a stale internal identity cannot resolve to some other
  category. (A literal numeric collision between a category's internal identity
  and another's public identity cannot exist here because internal category keys
  are UUIDs; the guarantee tested is public-only lookup plus UUID rejection.)
  Internal resolution results are used for all relationship queries and
  assignments.
- Storefront and seller consumers keep treating identifiers as opaque non-empty
  strings through the shared `idSchema`.
- The projected catalog documents carry `categoryPublicId` alongside the internal
  `categoryId` used for subtree filtering; existing documents must be reprojected
  for the public id field to appear.

The cutover is gated and staged. Each build has an intrinsic category identity
generation (`1` internal UUIDs, `2` public decimal identity; this source speaks
and advertises `2`); `GET /v1/categories/contract` advertises the generation that
build speaks (no configurable override that could
claim other semantics). Only the actual
category-bearing endpoints (`/categories*` except the probe, `/products`,
`/products/facets`, `/shops/*/products*`) carry and require
`x-category-identity-generation`; the API rejects a missing or stale generation
with `409 CATEGORY_IDENTITY_GENERATION_MISMATCH` before the resolver or an
assignment runs, closing the client's check-then-send race. Unrelated nested
product routes — including the native `EventSource` inventory stream — are exempt. A **prepared** release (old
internal semantics plus the guard, pinned to the then-current generation) ships
before activation; at activation the client detects the newer generation,
invalidates only category-bearing state (breadcrumb, category user-activity, and
the stale category reference in cached product views), and reloads **at most
once**.
A **confirmed** mismatch — the probe observing a different generation, or a
backend rejection of the client's header — is terminal for the running app
instance: the client latches `incompatible`, rejects every subsequent
category-bearing request immediately (no probe, no network), never adopts the
server's generation, and does not retry or auto-refetch the affected queries. A
probe that initially cannot confirm (network failure, timeout) stays `unavailable`
and is retried, never latched. Concurrent contract probes share one in-flight
request; a successful confirmation is reused in memory. A session marker keeps a
still-stale bundle from looping; only an explicit re-check that confirms
compatibility clears it. A failed manual check preserves a confirmed mismatch
without reloading; a confirmed ongoing mismatch permits one explicit reload to
fetch a newer bundle. Affected category surfaces render a scoped "Application
update required" card with an explicit, bounded check-for-update action instead
of an endless skeleton, while unrelated routes keep working.
The web bundle's persisted-version check only invalidates stored state for a
client already running the new bundle — it cannot force an already-open tab
running JS older than the preparation release to reload, which is why the
preparation release is mandatory and why the API rejects legacy ids.
See [category cutover deployment](../../../docs/operations/deployment/category-public-identity-cutover.md).

## Direct resolution contract

`GET /v1/categories/:id` is the authoritative storefront resolution for a
category public identity. It returns the current category and its ordered
root-to-current ancestry (the ancestry includes the resolved category as its
last entry):

```json
{
  "category": { "id": "34", "slug": "ceramic-mugs", "name": "Mugs", "featured_facet_keys": ["material"] },
  "ancestry": [
    { "id": "12", "slug": "home", "name": "Home" },
    { "id": "34", "slug": "ceramic-mugs", "name": "Mugs" }
  ],
  "canonical_path": "/c/ceramic-mugs-c34"
}
```

- `:id` is a positive decimal public identity without leading zeros, handled as a
  string so values beyond JavaScript's safe integer range survive transport
  unchanged. Values beyond PostgreSQL `bigint` range are treated as absent, never
  as a database error.
- Malformed and unknown identities return `404 CATEGORY_NOT_FOUND`; the resolver
  never falls back to internal-UUID lookup. Backend failures remain `5xx`.
  Category availability states are not modeled here or by the follow-up work in
  this epic; any category hiding or deletion behavior that exists independently is
  preserved as-is.
- `canonical_path` is the flat canonical URL `/c/:slug-c:publicId`. `c` is a
  URL-layer marker only and is never persisted. The same policy generates
  navigation links and redirect destinations, so aliases converge on the current
  URL in one hop.
- `slug` is also exposed on the existing category list/detail responses so
  consumers can build canonical links without a second resolution call.
- Resolution is authoritative on every request; breadcrumbs are derived from this
  ancestry rather than from session state. Alias canonicalization consumes
  `canonical_path` (see "Canonical redirects" below). Category availability
  states are not modeled here or by the follow-up work in this epic; any category
  hiding or deletion behavior that exists independently is preserved as-is.

## Canonical redirects

Status: Implemented.

The storefront canonicalizes every category URL from the authoritative
resolution; the API exposes no redirect of its own.

- `GET /v1/categories/legacy-path?path=/c/<segments>` resolves a recorded
  legacy path through its permanent alias owner and returns the same
  `{ category, ancestry, canonical_path }` shape as `GET /v1/categories/:id`.
  The path is matched as an opaque key: malformed, unknown, and unowned paths
  return `404 CATEGORY_NOT_FOUND` and never fall back to a parent path or a
  first match. Backend failures stay `5xx`.
- The storefront resolves a flat `/c/:slug-c:publicId` segment by public
  identity, or a hierarchical `/c/...` path through the legacy-path endpoint,
  then compares the requested URL against `canonical_path`.
- A mismatch — a wrong or outdated slug, a trailing slash, or a legacy path — is
  answered with a single HTTP `301` whose `Location` is the current canonical URL
  with the original query preserved. A direct request receives `301`; an in-app
  SPA transition replaces the route in place, preserving the query. The
  destination then serves `200` with no further redirect.
- Navigation links and `link[rel="canonical"]` metadata use the same
  `canonical_path` policy, so generated links and redirect destinations agree.
- Legacy ownership is bound to category identity, so a legacy URL always
  converges on the category's *current* slug. Because slugs are set only at
  creation and no rename path exists, ordinary name edits leave persisted slugs
  unchanged.

Deferred (not built by this epic): admin slug-edit APIs and interfaces,
explicit-edit normalization/validation, slug-edit and repeated-edit journeys,
new category availability states, and new ancestor-unavailability enforcement.
Existing category hiding/deletion behavior is preserved; the alias table's
`on delete restrict` still blocks deleting a category that owns a legacy path.
No slug-history table is introduced for ID-bearing aliases: an `/c/:slug-c:id`
URL is canonicalized from the live slug rather than from stored history.

## Subtree listings and facets

`GET /v1/products` and `GET /v1/products/facets` resolve `category_id` through
the same authoritative category lookup, so both describe the identical live
descendant subtree:

- A category listing and its facets include every eligible product whose current
  category is the resolved category or one of its descendants. Scope is resolved
  from `categories.parent_id` at query time; it is not projected into the catalog
  read model, so no projection or backfill is required.
- Products are deduplicated by product identity. The projected catalog document
  carries a single internal `categoryId`, so the `$in` scope cannot return a
  product twice.
- Existing Product browse/purchase visibility rules are unchanged: the listing
  still filters `state = active` and `flags.hasImages = true`, and facets run over
  the same filtered document set.
- An accessible category with no eligible products returns `200` with an empty
  item list and empty facets; it is not a `404`.

The hierarchy is fixed at runtime: this epic does not expose category moves or
any other hierarchy mutation, so the seeded taxonomy is stable for the life of a
deployment. Subtree reads are therefore served through the optional
`category.taxonomy-subtree` cache (five-minute TTL). Because `parent_id` is not
changed during supported operation, the cached subtree stays
aligned with the uncached listing scope. Unsupported create/move/delete changes
can leave cached facet scope stale for up to five minutes; no hierarchy-change
invalidation hook or immediate post-mutation consistency is claimed.

## Migration and deployment

Run `pnpm db:migration:up` from `apps/api/api` before activation. The additive
migration preserves internal relationships while backfilling public identity
and capturing historical path ownership. Activate only after identity/path
completeness and `category_legacy_path_cutover_gate.ready` pass, existing catalog
documents are reprojected with `categoryPublicId`, and API/seller/storefront
releases are coordinated. Keep the preparation patch as old-release tooling,
not a runtime compatibility shim. The
[deployment runbook](../../../docs/operations/deployment/category-public-identity-cutover.md)
defines SQL preflight, conflict resolution, rollout, and verification evidence.
