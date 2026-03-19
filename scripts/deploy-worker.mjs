import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseJson,
  requireString,
  run,
  loadPulumiOutputs,
  repoRoot,
} from "./utils.mjs";

const baseConfigPath = path.join(repoRoot, "wrangler.jsonc");
const generatedConfigPath = path.join(repoRoot, ".wrangler.deploy.jsonc");
const dryRun = process.argv.includes("--check") || process.argv.includes("--dry-run");

function requireArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Expected ${label} to contain at least one entry.`);
  }
  return value;
}

function buildWranglerConfig(baseConfig, outputs) {
  const config = structuredClone(baseConfig);

  config.account_id = requireString(outputs.accountId, "Pulumi output accountId");
  config.name = requireString(outputs.workerScriptName, "Pulumi output workerScriptName");

  const kvNamespaces = requireArray(config.kv_namespaces, "kv_namespaces");
  kvNamespaces[0].id = requireString(outputs.cacheNamespaceId, "Pulumi output cacheNamespaceId");

  const r2Buckets = requireArray(config.r2_buckets, "r2_buckets");
  r2Buckets[0].bucket_name = requireString(outputs.uploadsBucketName, "Pulumi output uploadsBucketName");

  const d1Databases = requireArray(config.d1_databases, "d1_databases");
  d1Databases[0].database_name = requireString(outputs.databaseName, "Pulumi output databaseName");
  d1Databases[0].database_id = requireString(outputs.databaseId, "Pulumi output databaseId");

  const queueName = requireString(outputs.queueName, "Pulumi output queueName");
  const queues = config.queues;

  if (!queues) {
    throw new Error("Expected wrangler.jsonc to define queues.");
  }

  const producers = requireArray(queues.producers, "queues.producers");
  producers[0].queue = queueName;

  const consumers = requireArray(queues.consumers, "queues.consumers");
  consumers[0].queue = queueName;

  return config;
}

async function main() {
  console.log(`Loading Pulumi outputs from stack "${process.env.PULUMI_STACK_NAME ?? "prod"}"...`);

  const [outputs, baseConfigText] = await Promise.all([
    loadPulumiOutputs(),
    readFile(baseConfigPath, "utf8"),
  ]);

  // Make account ID available to wrangler sub-processes.
  process.env.CLOUDFLARE_ACCOUNT_ID = requireString(outputs.accountId, "Pulumi output accountId");

  const baseConfig = parseJson(baseConfigText, "wrangler.jsonc");
  const generatedConfig = buildWranglerConfig(baseConfig, outputs);

  await writeFile(generatedConfigPath, `${JSON.stringify(generatedConfig, null, 2)}\n`, "utf8");
  console.log(`Generated Wrangler config at ${path.relative(repoRoot, generatedConfigPath)} from Pulumi outputs.`);

  console.log("Validating generated Worker config...");
  await run("wrangler", ["deploy", "--dry-run", "--config", generatedConfigPath]);

  if (dryRun) {
    console.log("Dry run complete; skipping deployment.");
    return;
  }

  console.log("Applying D1 migrations...");
  await run("wrangler", ["d1", "migrations", "apply", "DB", "--remote", "--config", generatedConfigPath]);

  console.log("Deploying Worker...");
  await run("wrangler", ["deploy", "--config", generatedConfigPath]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
