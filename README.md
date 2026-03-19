# CF Boilerplate

Cloudflare-first starter for a Worker API, a Pages frontend, shared storage
resources, and Pulumi-managed infrastructure.

## What is here

- `src/domain` keeps the greeting logic pure and testable.
- `src/application` shapes the API response.
- `src/services` holds the D1, KV, R2, and Queue helpers.
- `src/worker.ts` is the Cloudflare Worker entrypoint.
- `pages/index.html` is the static Pages frontend.
- `migrations` holds the D1 schema.
- `infra/pulumi` provisions the Cloudflare resources.
- `tests` covers unit, contract, integration, and browser-level checks.

## Prerequisites

- Node.js 20+.
- `wrangler` installed globally.
- `pulumi` CLI installed globally.

## Install

```bash
npm install
```

Then generate the Worker env types:

```bash
npm run types
```

## Run locally

```bash
npm run dev
```

That starts the Worker locally.

For the Pages shell, run:

```bash
npm run pages:dev
```

## Tests

Fast checks run the Worker tests inside Cloudflare's local runtime via the
Miniflare-backed Vitest integration and apply the D1 migrations automatically:

```bash
npm test
```

Browser-level smoke test:

```bash
npm run test:e2e
```

Full suite:

```bash
npm run test:all
```

## Deploy

### Worker

`npm run deploy` reads the latest Pulumi stack outputs, renders a transient Wrangler
config with the provisioned Cloudflare resource IDs, validates it, and deploys the Worker.

For local deploys, make sure the Pulumi stack is current first:

```bash
cd infra/pulumi
pulumi up
```

### Automatic deploys

Every push to `main` runs the same flow in GitHub Actions. Add `PULUMI_ACCESS_TOKEN`
and `CLOUDFLARE_API_TOKEN` as repository secrets so the workflow can refresh the
Pulumi stack and deploy the Worker.

### Pages

```bash
npm run pages:deploy
```

### Pulumi infra

Set the Pulumi config values first. The Worker deploy path will consume the resulting
stack outputs automatically:

```bash
cd infra/pulumi
pulumi login
pulumi stack init dev
pulumi config set accountId <CLOUDFLARE_ACCOUNT_ID>
pulumi config set --secret apiToken <CLOUDFLARE_API_TOKEN>
pulumi config set zoneId <CLOUDFLARE_ZONE_ID>
pulumi config set domainName <YOUR_DOMAIN>
pulumi config set projectName cf-boilerplate
pulumi config set workerScriptName cf-boilerplate-api
```

Then apply the stack:

```bash
cd infra/pulumi
pulumi up
```

## Notes

- The Worker currently answers `GET /`, `GET /health`, `GET|POST /api/hello`,
  `GET|PUT|DELETE /api/demo/r2/:key`, and `POST /api/demo/queue`.
- The Pages frontend exercises the hello route and exposes the R2/Queue demos.
- The Pulumi stack creates the D1 database, KV namespace, R2 bucket, Queue,
  Pages project shell, and Worker route.
- The Miniflare/Vitest setup loads `migrations/0001_init.sql` before the tests.
- Run `npm run types` again whenever the Worker bindings change.
