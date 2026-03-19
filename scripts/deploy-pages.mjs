import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  requireString,
  run,
  loadPulumiOutputs,
  repoRoot,
} from "./utils.mjs";

const htmlPath = path.join(repoRoot, "pages", "index.html");

async function main() {
  // Validate required env vars before any network calls.
  const workerUrl = requireString(process.env.CF_API_WORKER_URL, "CF_API_WORKER_URL env var");

  console.log(`Loading Pulumi outputs...`);
  const outputs = await loadPulumiOutputs();

  const accountId = requireString(outputs.accountId, "Pulumi output accountId");
  const pagesProjectName = requireString(outputs.pagesProjectName, "Pulumi output pagesProjectName");

  // Make account ID available to wrangler sub-processes.
  process.env.CLOUDFLARE_ACCOUNT_ID = accountId;

  // Bake the Worker URL into the static HTML so the browser calls it directly.
  const html = await readFile(htmlPath, "utf8");
  const patched = html.replace('data-api-base-url="/api"', `data-api-base-url="${workerUrl}"`);
  if (patched === html) {
    throw new Error('Could not find data-api-base-url="/api" in pages/index.html to patch.');
  }
  await writeFile(htmlPath, patched, "utf8");
  console.log(`Baked Worker URL ${workerUrl} into pages/index.html.`);

  console.log(`Deploying Pages site to "${pagesProjectName}"...`);
  await run("wrangler", ["pages", "deploy", "pages", "--project-name", pagesProjectName]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
