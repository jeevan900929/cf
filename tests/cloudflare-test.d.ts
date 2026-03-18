/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { D1Migration } from "cloudflare:test";

declare global {
  interface Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}

declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}

declare module "cloudflare:workers" {
  interface ProvidedEnv {
    TEST_MIGRATIONS: D1Migration[];
  }
}
