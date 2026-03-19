# CF Boilerplate

Cloudflare-first fullstack demo exercising JWT auth, Durable Objects (SQLite +
WebSocket), D1, KV, R2, and Queues. Two environments: local dev (Miniflare) and
production (deployed on every push to `main`).

## Request flow

```
User -> Worker (edge)
         |-- reads KV (config, feature flags)
         |-- authenticates (JWT via crypto.subtle)
         |-- calls Durable Object by room ID
         |     |-- updates in-memory counter
         |     |-- writes event to SQLite
         |     |-- broadcasts to WebSocket clients
         |     +-- returns result
         |-- pushes message to Queue (async)
         |     +-- Consumer (later)
         |           |-- reads R2 template
         |           |-- writes to D1
         |           +-- calls external API
         +-- responds to user
```

## Structure

| Path | Purpose |
|---|---|
| `shared/types/` | API contracts shared between Worker and frontend |
| `src/auth/` | JWT sign/verify (HMAC-SHA256 via crypto.subtle) |
| `src/durable-objects/` | Room DO with SQLite + WebSocket hibernation |
| `src/services/` | D1, KV, R2, Queue, config helpers |
| `src/worker.ts` | Worker entrypoint and routing |
| `pages/index.html` | Static Pages frontend |
| `migrations/` | D1 schema migrations |
| `infra/pulumi/` | Pulumi IaC for prod resources |
| `scripts/` | Deploy scripts and shared utils |

## Prerequisites

- Node.js 22+

## Install

```bash
npm install
npm run types   # generate Worker binding types from wrangler.jsonc
```

## Local dev

```bash
npm run dev
```

Runs two native Wrangler processes:

- **Worker** at `http://localhost:8787` - hot-reloads, D1 migrations auto-applied
- **Pages** at `http://localhost:8788` - serves static HTML, proxies /api/* to Worker

Everything runs locally via Miniflare. No Cloudflare account needed.

Demo login: username `demo`, password `demo`.

## Tests

```bash
npm test        # unit + contract + integration (Miniflare-backed Vitest)
npm run check   # tests + typecheck (same gate as CI and pre-commit hook)
```

## API routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/auth/login | No | Returns JWT token |
| GET | /api/config | Yes | KV feature flags |
| GET/POST | /api/hello | Yes | Greeting with D1 + KV cache |
| POST | /api/rooms/:id/action | Yes | DO counter action |
| GET | /api/rooms/:id/state | Yes | DO current state |
| GET | /api/rooms/:id/history | Yes | DO event log (SQLite) |
| GET | /api/rooms/:id/websocket | Yes | WebSocket upgrade |
| PUT/GET/DELETE | /api/demo/r2/:key | Yes | R2 file operations |
| POST | /api/demo/queue | Yes | Enqueue async job |
| GET | /health | No | Health check |

## Production deploy

Every push to `main` triggers GitHub Actions:

1. **changes** - detects which paths changed (selective deploy)
2. **test** - `npm run check`
3. **infra** - `pulumi up`, exports resource IDs
4. **deploy-worker** - only if Worker files changed
5. **deploy-pages** - only if Pages files changed (bakes Worker URL into HTML)

## Config and secrets map

### GitHub Secrets (CI)

| Secret | Purpose | Rotation |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Wrangler + Pulumi auth | Rotate in Cloudflare dashboard, update in GitHub repo settings |
| `CF_API_WORKER_URL` | Baked into Pages HTML at deploy time | Only changes if Worker subdomain changes |

### Pulumi config (`infra/pulumi/Pulumi.prod.yaml`)

| Key | Purpose | Notes |
|---|---|---|
| `accountId` | Cloudflare account ID | Not secret; committed to repo |

### Pulumi outputs (computed at deploy time)

| Output | Used by |
|---|---|
| `databaseId` | deploy-worker.mjs (D1 binding) |
| `databaseName` | deploy-worker.mjs (D1 binding) |
| `cacheNamespaceId` | deploy-worker.mjs (KV binding) |
| `uploadsBucketName` | deploy-worker.mjs (R2 binding) |
| `queueName` | deploy-worker.mjs (Queue binding) |
| `pagesProjectName` | deploy-pages.mjs |
| `accountId` | Both deploy scripts (CLOUDFLARE_ACCOUNT_ID env) |

### KV runtime keys (auto-generated, no manual setup)

| Key | Purpose | Notes |
|---|---|---|
| `auth:jwt-secret` | JWT signing key (HMAC-SHA256) | Auto-generated on first login; rotate by deleting the key |
| `config:app` | Feature flags JSON | Auto-seeded with defaults; edit via KV dashboard or API |

### Durable Object state

| Binding | Class | Storage | Notes |
|---|---|---|---|
| `ROOMS` | `Room` | SQLite | Managed by Cloudflare runtime; no external config |

### Pulumi OIDC (CI auth)

CI authenticates to Pulumi via GitHub OIDC - no `PULUMI_ACCESS_TOKEN` secret.
The OIDC trust must allow `urn:pulumi:token-type:access_token:personal` scoped
to `user:jeevanraj-angamuthu-ext-sadhguru-org`.

## First-time Pulumi setup

```bash
cd infra/pulumi
pulumi login
pulumi stack init prod
pulumi config set accountId <CLOUDFLARE_ACCOUNT_ID>
pulumi up
```

Optional custom domain:
```bash
pulumi config set zoneId <ZONE_ID>
pulumi config set domainName <DOMAIN>
```

## Live endpoints

| | URL |
|---|---|
| Worker API | `https://cf-boilerplate-api.cf-boilerplate.workers.dev` |
| Pages site | `https://cf-boilerplate-web.pages.dev` |

The `pages.dev` subdomain is the free fixed domain. Per-deployment preview
URLs like `abc123.cf-boilerplate-web.pages.dev` are also available. For a
custom domain, add a CNAME to the Pages project via Cloudflare dashboard.

## Notes

- Run `npm run types` after changing bindings in `wrangler.jsonc`.
- `wrangler.jsonc` has placeholder IDs; `deploy-worker.mjs` patches them with
  real Pulumi outputs before each prod deploy.
- Pre-commit hook enforces monorepo boundaries (no cross-imports between
  `src/` and `pages/`) and runs the full test suite.
