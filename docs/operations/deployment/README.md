# API Deployment

The API is hosted on Render as an **image-backed service**: GitHub Actions builds the
Docker image, applies migrations, and Render only pulls and runs the image.

## Flow

```
push to production
  → CI validate (api CI job)
  → build linux/amd64 image, push ghcr.io/dauphaihau-arc/api:<sha> and :latest
  → run `pnpm db:migration:up` from that image against the production database
  → call the Render deploy hook with imgURL=<sha tag>
  → Render pulls the image and starts the API
```

The container never migrates. `CMD` is `pnpm start:prod`; `docker-compose.yml` overrides the
command so local stacks still migrate on start.

## Files

| File | Role |
| --- | --- |
| [api/Dockerfile](../../../api/Dockerfile:1) | Build stage (dev deps, `pnpm build`) and runtime stage (prod deps, `dist`, `CMD pnpm start:prod`) |
| [.github/workflows/ci.yml](../../../.github/workflows/ci.yml:1) | `validate` gates `publish-image`: build + push, migrate, then trigger Render |
| [render.yaml](../../../render.yaml:1) | `runtime: image`, GHCR image URL, registry credential, health check |

## One-time setup

1. **Registry credential** — Workspace Settings → *Container Registry Credentials* → add a
   GitHub personal access token with `read:packages`, named `ghcr-read.` (matches the credential name in Render, trailing period included).
   Skip this if the GHCR package is public.
2. **Build source** — service *Settings* → *Build* → *Source* → *Edit* → choose the image
   source `ghcr.io/dauphaihau-arc/api:latest` with the credential from step 1. Switching the
   source is a Dashboard action; a Blueprint cannot do it for a service that was created
   from a Git repo. Render triggers a deploy with the new source.
3. **Start command — leave empty.** The image `CMD` is `pnpm start:prod`. Do not set a Render
   `dockerCommand`: Render does not give that field shell semantics, and a value like
   `sh -lc '…'` fails with `Exited with status 127`. Set the health check path to `/health`.
4. **Deploy hook** — service *Settings* → *Deploy Hook* → store the URL as the GitHub repo
   secret `RENDER_DEPLOY_HOOK_URL`.
5. **Infisical access for CI** — store a machine-identity token as the GitHub repo secret
   `INFISICAL_TOKEN` and the project id as `INFISICAL_PROJECT_ID` (repository variable or
   secret — the workflow reads either). The migrate
   step resolves `DATABASE_URL` from the `prod` environment of that project, so the database
   URL is never duplicated into GitHub: one source (Infisical) feeds both Render's runtime env
   and the CI migration step.
6. **Image URL** — keep the service's default image URL at
   `ghcr.io/dauphaihau-arc/api:latest`. The deploy hook only validates the tag, so every
   component of `imgURL` besides the tag must match this URL.

Until step 2 is done the deploy hook answers
`{"badrequest":"node environment does not support image URLs"}`, because the service is
still a native Node runtime and has no image to pull.

Render has no Git connection to this service, so `autoDeployTrigger` no longer applies.

## Constraints

- **Migrations run before the deploy, not inside it.** The migrate step executes the image
  `pnpm db:migration:up` against the production database, then the deploy hook fires. A
  failing migration stops the job, so Render is never asked to deploy. A migration that
  succeeds followed by a failed deploy leaves the schema ahead of the running code — keep
  migrations backward compatible (expand/contract).
- **One migration per release.** `concurrency` cancels superseded pull-request runs but never
  a `production` run, and the `publish-image` job is serialised by its own group.
- **One source for the database URL.** Infisical `prod` feeds both Render's runtime env and the
  CI migrate step; only `INFISICAL_TOKEN` (read-only machine identity) lives in GitHub. Rotate
  the Neon credential in Infisical only.
- **CI needs network access to Infisical and Neon.** The migrate step runs on a GitHub runner,
  so the database must accept external connections and `DATABASE_URL` must carry
  `sslmode=require`.
- **Images must be `linux/amd64`.** The workflow pins `platforms: linux/amd64`. Local builds
  on Apple Silicon need `docker build --platform linux/amd64` or emulation.
- **Render pulls on every deploy, restart, and reschedule.** Never delete old `:<sha>` tags:
  Render rollbacks require the previous image to still exist in GHCR.
- **Runtime dependencies only.** The runtime stage installs production dependencies, so
  anything imported at runtime has to be a regular dependency (`@mikro-orm/cli` is, which is
  why the migrate step works). Keep `LOG_PRETTY=false`: `pino-pretty` is a dev dependency.
- **No build secrets.** `.npmrc` maps the `@dauphaihau-arc` scope to GitHub Packages but no
  dependency uses it; the image build needs only `GITHUB_TOKEN` for GHCR.

## Diagnostics

- `INFISICAL_TOKEN secret and INFISICAL_PROJECT_ID value are required` → configure them
  (step 5); nothing was deployed.
- `infisical run` fails with 401/403 → the machine identity is expired or lacks read access to
  the `prod` environment.
- Migrate step fails → Render is not triggered, the running deploy keeps serving; fix and
  re-run the job. Past this point the database may already be migrated: check
  `mikro_orm_migrations` before re-running.
- Deploy fails with `Image Pull Failed` → registry credential or tag missing.
- Deploy hook returns `{"badrequest":"node environment does not support image URLs"}` →
  the service is still a native runtime; switch its build source to the image (step 2).
- Deploy exits with status 127 and the log shows the whole start string as one `not found`
  command → a Render `dockerCommand` is set; clear it and let the image `CMD` run.
- Verify a rollout: the migrate step log ends with `Successfully migrated up to the latest
  version`, the Render event log shows the image pull for the pushed SHA, then `GET /health`
  returns 200.

## Release runbooks

- [Category public identity cutover](./category-public-identity-cutover.md)
  — preparation, migration preflight, legacy ownership, coordinated activation,
  and verification.
