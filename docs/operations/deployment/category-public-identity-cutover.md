# Category public identity cutover

Use this checklist to activate category identity generation `2` across the API,
seller, and storefront. For identifier and routing contracts, see
[ADR 014](../../../api/docs/adrs/014-category-public-identities-and-legacy-paths.md).

## Preparation — existing internal-ID deployments only

Skip this phase for a first deployment with no old clients; database checks
still apply.

1. On the old API, add the generation-`1` probe using the
   [preparation patch](./category-identity-preparation.patch). Check against that
   checkout first; the patch adds only the endpoint, not a complete release.
2. Backport the guard to old internal-ID clients and pin generation `1`.
   Do not relabel a current public-ID bundle as an old-semantic bundle.
3. Verify mismatch blocking, selective state invalidation, and one automatic
   reload. Already-open tabs older than preparation cannot run the new guard;
   activation rejects their requests but cannot guarantee the new update UI.

## Database preflight and legacy ownership

Back up the target databases and pause category writes before running
`pnpm db:migration:up` from `api/` in this API checkout. Finalize the seeded
hierarchy before traffic. Run these read-only queries on the target PostgreSQL
database:

```sql
select count(*) as category_count,
       count(*) filter (where public_id is null or public_id <= 0
                         or slug is null or slug = '') as invalid_identity_count,
       count(*) - count(distinct public_id) as duplicate_identity_count
from categories;

select ready, unresolved_conflict_count
from category_legacy_path_cutover_gate;

select count(*) as missing_single_owner_alias_count
from (
  select legacy_path, min(category_id::text)::uuid as category_id
  from category_legacy_path_candidates
  group by legacy_path having count(*) = 1
) candidate
left join category_legacy_path_aliases alias
  on alias.legacy_path = candidate.legacy_path
 and alias.category_id = candidate.category_id
where alias.legacy_path is null;

select conflict.legacy_path, candidate.category_id,
       category.public_id::text, category.name
from category_legacy_path_conflicts conflict
join category_legacy_path_candidates candidate using (legacy_path)
left join categories category on category.id = candidate.category_id
where conflict.resolved_category_id is null
order by conflict.legacy_path, candidate.category_id;
```

**Release gate:** zero invalid/duplicate identities and missing single-owner
aliases; `ready = true` and zero unresolved conflicts.

For each conflict, explicitly approve a captured candidate and run
`select resolve_category_legacy_path($1, $2::uuid)` with its path and UUID.
Rerun the gate. Never choose an arbitrary first row, invent aliases, or reassign
an owner. Captured paths cannot recover names/parents lost before migration.

## Controlled activation

1. Drain category-bearing traffic and projection writers; retain prior deploy
   artifacts. Complete the migration and SQL release gate above.
2. Build API, seller, and storefront as generation `2`, without mixed-ID fallbacks.
3. From `api/`, run `pnpm catalog:refresh-products` against the intended MongoDB
   catalog. **It clears product, price, slug, and search projection collections
   before rebuilding active products.** Keep writers stopped and browse traffic
   drained until completion; verify rebuilt documents carry `categoryPublicId`.
4. Activate API and both web consumers together. Storefront requires Nitro
   `nuxt build`, not static generation; `/c/**` must disable ISR/cache.
   Configure API origin and CORS.
5. Pass the hosted smoke checks below before reopening traffic. On failure,
   keep traffic drained and restore compatible API/web/projection artifacts
   together. Never roll back only the API or rewrite public IDs/aliases.

Keep the hierarchy fixed while serving traffic. Unsupported create/move/delete
changes can leave cached facets stale relative to listings for up to five
minutes. Moves, new availability controls/ancestor propagation, and admin slug
editing remain deferred; preserve existing hiding/deletion and Product visibility.

## Verification

Run root `./scripts/verify` and, from `api/`,
`pnpm test:int --runInBand --testPathPatterns='category-'`.
Browser suites run separately: [storefront E2E](../../../../web/apps/storefront/e2e/README.md)
and [seller browser tests](../../../../web/README.md#seller-browser-tests).
Do not run browser builds and typechecks concurrently against the same `.nuxt`.

Hosted smoke checklist:

- Contract probe advertises `2`; missing/stale generation on category-bearing
  requests returns `409`, while compatible requests succeed.
- Fresh category access, reload, ancestry links, descendant filters, and seller
  category assignment work; empty categories return `200`.
- Wrong slug, trailing slash, and a recorded legacy path return one `301` with
  the query preserved. Disable redirect auto-follow, inspect `Location`, then
  confirm the destination returns `200` without another hop.
- Unknown/malformed routes return `404`; backend failures remain `5xx`.
- Stale category state is invalidated without clearing unrelated preferences;
  prepared clients block mismatched requests with a bounded reload.

Record target-data gates and hosted observations at activation. Local rehearsal
evidence is in [ticket 07](../../../../../.scratch/category-public-id-routing/issues/07-complete-cutover-verification-and-remove-obsolete-paths.md);
it does not certify production data or replace hosted checks.
