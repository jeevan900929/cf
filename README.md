# CF Boilerplate

Cloudflare-first starter with two environments: a local dev environment backed
by Miniflare and a production environment deployed to Cloudflare on every push
to `main`.

## Structure

| Path | Purpose |
|---|---|
| `src/domain` | Pure greeting logic, fully unit-testable |
| `src/application` | API response shaping |
| `src/services` | D1, KV, R2, and Queue helpers |
| `src/worker.ts` | Cloudflare Worker entrypoint |
| `pages/index.html` | Static Pages frontend |
| `migrations/` | D1 schema migrations |
| `infra/pulumi/` | Pulumi program that provisions prod resources |
| `tests/` | Unit, contract, integration, and browser tests |
| `scripts/deploy-worker.mjs` | Prod deploy: injects Pulumi outputs → Wrangler |

## Prerequisites

- Node.js 20+

## Install

```bash
npm install
npm run types   # generate Worker binding types from wrangler.jsonc
```

## Local dev

```bash
npm run dev
```

This runs two native Wrangler processes in parallel:

- **Worker API** at `http://localhost:8787` — hot-reloads on save; D1
  migrations in `migrations/` are applied automatically on start.
- **Pages site** at `http://localhost:8788` — serves `pages/index.html` and
  proxies API calls to the Worker.

Everything runs locally through Miniflare. No Cloudflare account or Pulumi
is needed for local dev.

## Tests

```bash
npm test           # unit + contract + integration (Miniflare-backed Vitest)
npm run test:e2e   # Playwright browser smoke test
npm run test:all   # both
npm run check      # tests + typecheck (same gate as CI)
```

## Production deploy

Every push to `main` triggers the GitHub Actions workflow which:

1. Runs `npm run check` (tests + typecheck).
2. Runs `pulumi up` on the `prod` stack to provision or update Cloudflare
   resources (D1, KV, R2, Queue, Pages project).
3. Runs `npm run deploy` which reads Pulumi outputs, generates a Wrangler
   config with the real resource IDs, deploys the Worker, then deploys the
   Pages site.

### Required GitHub secret

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token with Workers, Pages, D1, KV, R2, and Queue permissions |

### First-time Pulumi setup

The `prod` Pulumi stack is the only stack. There is no `dev` stack — local
development uses Miniflare exclusively.

```bash
cd infra/pulumi
pulumi login
pulumi stack init prod
pulumi stack select prod
pulumi config set accountId <CLOUDFLARE_ACCOUNT_ID>
# optional: add a custom route
pulumi config set zoneId    <CLOUDFLARE_ZONE_ID>
pulumi config set domainName <YOUR_DOMAIN>
pulumi up
```

The Cloudflare API token is **not** stored in Pulumi config. Set
`CLOUDFLARE_API_TOKEN` in your shell for local `pulumi up`, and add it as a
repository secret for CI.

### Pulumi OIDC (CI)

CI authenticates to Pulumi via GitHub OIDC — no `PULUMI_ACCESS_TOKEN` secret
required. The OIDC trust policy must allow
`urn:pulumi:token-type:access_token:personal` scoped to
`user:jeevanraj-angamuthu-ext-sadhguru-org`.

## Live endpoints (prod)

| | URL |
|---|---|
| Worker API | `https://cf-boilerplate-api.cf-boilerplate.workers.dev` |
| Pages site | `https://cf-boilerplate-web.pages.dev` |

## Notes

- Worker routes: `GET /health`, `GET|POST /api/hello`,
  `GET|PUT|DELETE /api/demo/r2/:key`, `POST /api/demo/queue`.
- Run `npm run types` after changing bindings in `wrangler.jsonc`.
- `wrangler.jsonc` contains placeholder IDs for local dev; `scripts/deploy-worker.mjs`
  replaces them with real Pulumi output values before every prod deploy.
