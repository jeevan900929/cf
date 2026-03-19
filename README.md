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

`npm run deploy:dev` reads the latest outputs from the local `dev` Pulumi stack, renders
a transient Wrangler config with the provisioned Cloudflare resource IDs, validates it,
and deploys the Worker.

For local deploys, make sure the `dev` stack is current first:

```bash
cd infra/pulumi
pulumi stack init dev
pulumi stack select dev
pulumi up
```

### Automatic deploys

Every push to `main` runs the `prod` stack in GitHub Actions. Pulumi auth happens
through GitHub OIDC, so the only repository secret you need for deployment is
`CLOUDFLARE_API_TOKEN`.

Before the workflow can run, register GitHub as an OIDC issuer in Pulumi and
allow this repo to exchange tokens for the `jeevanraj-angamuthu-ext-sadhguru-org`
account. This Pulumi account uses a personal OIDC token, so the policy must allow
`urn:pulumi:token-type:access_token:personal` scoped to
`user:jeevanraj-angamuthu-ext-sadhguru-org`.

### Pages

```bash
npm run pages:deploy
```

### Pulumi infra

Set the Pulumi config values on the stack you are targeting. `dev` powers local
deploys and `prod` powers the GitHub Action on `main`:

GitHub Actions authenticates to Pulumi with OIDC, so you do not need a
`PULUMI_ACCESS_TOKEN` secret anymore.

```bash
cd infra/pulumi
pulumi login
pulumi stack init dev
pulumi stack init prod
pulumi stack select prod
pulumi config set accountId <CLOUDFLARE_ACCOUNT_ID>
pulumi config set projectName cf-boilerplate
pulumi config set workerScriptName cf-boilerplate-api
```

The Cloudflare API token is **not** stored in Pulumi config. The Pulumi Cloudflare
provider reads `CLOUDFLARE_API_TOKEN` from the environment directly. Set this
environment variable locally and add it as a `CLOUDFLARE_API_TOKEN` repository
secret in GitHub for CI deployments.

`zoneId` and `domainName` are optional. Only set them if you want Pulumi to also
manage a custom Worker route like `api.example.com/*`. If you omit them, the prod
stack still deploys all account-level resources and the Worker script itself.

If you later want the custom route, add:

```bash
pulumi config set zoneId <CLOUDFLARE_ZONE_ID>
pulumi config set domainName <YOUR_DOMAIN>
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
  Pages project shell, and an optional Worker route when a custom zone is set.
- The Miniflare/Vitest setup loads `migrations/0001_init.sql` before the tests.
- Run `npm run types` again whenever the Worker bindings change.
