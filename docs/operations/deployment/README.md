# API Deployment

The API is hosted on Render as an **image-backed service**: GitHub Actions builds the
Docker image and Render only pulls and runs it.

## Flow

```
push to production
  → CI validate (api CI job)
  → build linux/amd64 image, push ghcr.io/dauphaihau-arc/api:<sha> and :latest
  → call the Render deploy hook with imgURL=<sha tag>
  → Render pulls the image, runs migrations, then starts the API
```

## Files

| File | Role |
| --- | --- |
| [api/Dockerfile](../../../api/Dockerfile:1) | Build stage (dev deps, `pnpm build`) and runtime stage (prod deps, `dist`, migrations in `CMD`) |
| [.github/workflows/ci.yml](../../../.github/workflows/ci.yml:1) | `validate` job gates `publish-image`, which pushes to GHCR and triggers Render |
| [render.yaml](../../../render.yaml:1) | `runtime: image`, GHCR image URL, registry credential, start command |

## One-time setup

1. **Registry credential** — Workspace Settings → *Container Registry Credentials* → add a
   GitHub personal access token with `read:packages`, named `ghcr-read` (matches `render.yaml`).
   Skip this if the GHCR package is public.
2. **Deploy hook** — service *Settings* → *Deploy Hook* → store the URL as the GitHub repo
   secret `RENDER_DEPLOY_HOOK_URL`.
3. **Image URL** — keep the service's default image URL at
   `ghcr.io/dauphaihau-arc/api:latest`. The deploy hook only validates the tag, so every
   component of `imgURL` besides the tag must match this URL.

Render has no Git connection to this service, so `autoDeployTrigger` no longer applies.

## Constraints

- **Migrations run in the start command.** `preDeployCommand` is available on paid compute
  plans only; the service is on `free`. Migrations therefore run inside the new instance
  before the health check passes, while the previous instance still serves traffic — keep
  migrations backward compatible.
- **Images must be `linux/amd64`.** The workflow pins `platforms: linux/amd64`. Local builds
  on Apple Silicon need `docker build --platform linux/amd64` or emulation.
- **Render pulls on every deploy, restart, and reschedule.** Never delete old `:<sha>` tags:
  Render rollbacks require the previous image to still exist in GHCR.
- **Runtime dependencies only.** The runtime stage installs production dependencies, so
  anything imported at runtime has to be a regular dependency (`@mikro-orm/cli` is, which is
  why `db:migration:up` works). Keep `LOG_PRETTY=false`: `pino-pretty` is a dev dependency.
- **No build secrets.** `.npmrc` maps the `@dauphaihau-arc` scope to GitHub Packages but no
  dependency uses it; the image build needs only `GITHUB_TOKEN` for GHCR.

## Diagnostics

- Deploy fails with `Image Pull Failed` → registry credential or tag missing.
- Deploy fails before the health check → read the instance logs for the migration output;
  the previous deploy keeps serving.
- Verify a rollout: Render event log shows the image pull for the pushed SHA, logs show the
  migrations applied, then `GET /health` returns 200.

## Release runbooks

- [Category public identity cutover](./category-public-identity-cutover.md)
  — preparation, migration preflight, legacy ownership, coordinated activation,
  and verification.
