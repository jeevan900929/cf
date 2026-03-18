import fs from "node:fs/promises";
import path from "node:path";

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

type D1Migration = {
  name: string;
  queries: string[];
};

async function loadD1Migrations(migrationsDir: string): Promise<D1Migration[]> {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const migrations: D1Migration[] = [];

  for (const fileName of files) {
    const filePath = path.join(migrationsDir, fileName);
    const contents = await fs.readFile(filePath, "utf8");
    const queries = contents
      .split(";")
      .map((query) => query.trim())
      .filter(Boolean);

    migrations.push({
      name: fileName,
      queries,
    });
  }

  return migrations;
}

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await loadD1Migrations(path.resolve("migrations"));

      return {
        wrangler: {
          configPath: "./wrangler.jsonc",
        },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
          },
        },
      };
    }),
  ],
  test: {
    setupFiles: ["./tests/setup/apply-migrations.ts"],
    include: [
      "tests/unit/**/*.test.ts",
      "tests/contract/**/*.test.ts",
      "tests/integration/**/*.test.ts",
    ],
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
