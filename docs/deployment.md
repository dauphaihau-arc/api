# API Deployment

The API is hosted on Render.

Current state:

- Render already has service configuration in [render.yaml](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/render.yaml:1).
- Render can auto-deploy directly from Git commits.

Optional improvement:

Keep GitHub Actions as validation only, then trigger Render only after CI passes by using a deploy hook.

Per Render's deploy hook docs, a service exposes a secret hook URL that can be triggered with a simple `GET` or `POST` request from GitHub Actions.

Source:

- [Render deploy hooks](https://render.com/docs/deploy-hooks)

Suggested secret name:

- `RENDER_DEPLOY_HOOK_URL`

If you want, add a follow-up workflow that:

1. waits for API CI to pass
2. only runs on `production`
3. calls the Render deploy hook
