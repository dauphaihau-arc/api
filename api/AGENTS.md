# Arc API Agent Instructions

This directory contains the Nest API. Read this file before changing API code.

## Before Editing

1. Identify the touched domain, platform module, integration, or bootstrap surface.
2. Read `agent-skills/README.md`, then load only the focused guidance needed for the change.
3. For domain-sensitive changes, confirm the relevant domain vocabulary from the repo context docs.
4. For architecture-sensitive changes, check source placement and cross-domain boundary guidance before editing.

## Guidance Router

The canonical API guidance index is `agent-skills/README.md`.

Load only the files relevant to the task:

- File placement or new module shape: `agent-skills/src-structure.md`
- HTTP contracts, DTOs, serializers, or controllers: `agent-skills/http-api-conventions.md`
- Domain/application errors or transport mapping: `agent-skills/layered-error-model.md`
- Cross-domain workflows or imports: `agent-skills/cross-domain-boundaries.md`
- Repository changes: `agent-skills/repository-conventions.md`
- Use cases or orchestration: `agent-skills/use-case-boundaries.md`
- Behavior changes and bug fixes: `agent-skills/testing.md`

## API Contract

`openapi.json` in this directory is a committed artifact generated from the
**compiled build** (`dist/`) in Nest preview mode. It must not require a
database, Redis, or Mongo.

```bash
pnpm spec:generate
pnpm spec:generate -- --check
```

- The generator boots `dist/src/bootstrap/app.module.js`, not the TypeScript
  sources. The `@nestjs/swagger` CLI plugin configured in `nest-cli.json`
  (`classValidatorShim`, `introspectComments`) only runs during `nest build`, so
  a DTO that relies on class-validator inference (implicit
  `type`/`required`/`enum`/bounds from decorators) is complete only in the
  compiled output. Generating from `ts-node` silently emitted empty or partial
  schemas for those DTOs.
- `pnpm spec:generate` therefore builds first (`pnpm build && ts-node ...`).
  Invoking `scripts/generate-openapi.ts` directly is supported, but it refuses
  to generate or verify from a missing or stale `dist/` and tells you to run
  `pnpm build`.
- Run `pnpm spec:generate` after any DTO or controller change; `-- --check` must
  be clean before merge. `./scripts/verify spec` runs it from the repo root.
- Every business endpoint under `/v1` declares its error responses with
  `@ApiErrorResponses` from `src/platform/http/api-error-responses.decorator.ts`.
- The spec is emitted verbatim, so wire casing follows the DTO declarations.

## Spec Package Publishing

The web apps consume the contract as `@dauphaihau-arc/api-spec`, published to
GitHub Packages (`https://npm.pkg.github.com`). The package ships one file,
`openapi.json`, at the package root.

- `openapi.json` in this directory stays the source of truth. The package copy
  at `packages/api-spec/openapi.json` is generated and gitignored; never edit it
  by hand.
- Sync the package after regenerating the spec:

  ```bash
  pnpm spec:generate
  pnpm spec:package            # copies api/openapi.json byte for byte
  pnpm spec:package -- --check # fails when the package copy is stale
  ```

- `version` in `packages/api-spec/package.json` is authoritative and is bumped
  by hand. Patch: descriptions or examples only. Minor: additive (new optional
  field, new endpoint). Major: breaking changes or a newly `required` field.
- Publishing happens in CI from `.github/workflows/publish-api-spec.yml` on
  merge to the default branch. The workflow fails when the manifest version is
  already published, so merging without a version bump is a deliberate failure,
  not a silent republish.
- Breaking changes are gated in CI. Before `npm publish`, the `Check for
  breaking contract changes` step resolves the last published version, downloads
  its tarball, and runs a pinned `oasdiff breaking <published> api/openapi.json
  --fail-on ERR`. The gate is version-aware: it reads the candidate major from
  `packages/api-spec/package.json` and the baseline major from the manifest
  inside the published tarball. When the candidate major is greater than the
  baseline major, ERR-level changes are printed and allowed with a notice; the
  major bump is what authorises the break. Otherwise any ERR-level change
  (removed field or endpoint, narrowed enum, newly `required` property,
  incompatible type change) fails the job with a message naming both majors and
  demanding either the next major or a restored contract. Additive WARN-level
  changes pass in every case, so they belong in a minor. An unresolvable version
  or an oasdiff failure fails the job closed. The first publication (npm E404)
  has no baseline and skips the gate with a notice.
- A breaking contract correction ships as a major bump: when the regenerated
  document newly documents behaviour the API already enforced (required request
  properties, bounds, formats, enums), consumers compiling against the package
  see a different TypeScript surface, so it is a major even though the runtime
  did not change. Never suppress the ERR entries; raise the major instead.
- Query DTOs declare `@ApiPropertyOptional` explicitly for every optional
  parameter. The Swagger plugin marks a property with a default initializer but
  no `?` as `required: true`, and without an explicit `type` it emits
  `allOf: [$ref Object]`; neither matches what the endpoint accepts.
- The gate diffs against the tarball published under the `latest` tag, so the
  baseline is what consumers actually installed, not the previous commit.

## Architecture Check

Run the executable API boundary check when touching domain, shared, or
integration code:

```bash
pnpm check:architecture
```

The root harness can run it from anywhere:

```bash
./scripts/verify architecture
```

## Verification

For API-only changes:

```bash
pnpm check
```

From the repository root:

```bash
./scripts/verify api
```
