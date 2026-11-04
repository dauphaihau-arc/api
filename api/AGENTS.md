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

`openapi.json` in this directory is a committed artifact generated from Nest in
preview mode. It must not require a database, Redis, or Mongo.

```bash
pnpm spec:generate
pnpm spec:generate -- --check
```

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
  --fail-on ERR`. Any ERR-level change (removed field or endpoint, narrowed
  enum, newly `required` property, incompatible type change) fails the job with
  a message demanding a major bump. Additive WARN-level changes pass, so they
  belong in a minor. In practice, a contract that removes a field or narrows an
  enum cannot ship as patch or minor: publish the major version the diff asks
  for, or restore compatibility. The first publication (npm E404) has no
  baseline and skips the gate with a notice.
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
