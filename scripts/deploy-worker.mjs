import { readFile, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pulumiDir = path.join(repoRoot, "infra", "pulumi");
const baseConfigPath = path.join(repoRoot, "wrangler.jsonc");
const generatedConfigPath = path.join(repoRoot, ".wrangler.deploy.jsonc");
const stackName = process.env.PULUMI_STACK_NAME ?? "prod";
const dryRun = process.argv.includes("--check") || process.argv.includes("--dry-run");

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse ${label}: ${message}`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required ${label}.`);
  }

  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Expected ${label} to contain at least one entry.`);
  }

  return value;
}

function run(command, args, cwd = repoRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed${
            signal ? ` with signal ${signal}` : ` with exit code ${code ?? "unknown"}`
          }.`,
        ),
      );
    });
  });
}

async function loadPulumiOutputs() {
  if (process.env.PULUMI_OUTPUTS_JSON) {
    return parseJson(process.env.PULUMI_OUTPUTS_JSON, "PULUMI_OUTPUTS_JSON");
  }

  if (process.env.PULUMI_OUTPUTS_FILE) {
    const filePath = path.resolve(repoRoot, process.env.PULUMI_OUTPUTS_FILE);
    return parseJson(
      await readFile(filePath, "utf8"),
      `Pulumi outputs file ${path.relative(repoRoot, filePath)}`,
    );
  }

  const { stdout } = await execFileAsync("pulumi", ["stack", "output", "--json", "-s", stackName], {
    cwd: pulumiDir,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  return parseJson(stdout, `Pulumi stack output for ${stackName}`);
}

function buildWranglerConfig(baseConfig, outputs) {
  const config = structuredClone(baseConfig);

  config.account_id = requireString(outputs.accountId, "Pulumi output accountId");
  config.name = requireString(outputs.workerScriptName, "Pulumi output workerScriptName");

  const kvNamespaces = requireArray(config.kv_namespaces, "kv_namespaces");
  kvNamespaces[0].id = requireString(
    outputs.cacheNamespaceId,
    "Pulumi output cacheNamespaceId",
  );

  const r2Buckets = requireArray(config.r2_buckets, "r2_buckets");
  r2Buckets[0].bucket_name = requireString(
    outputs.uploadsBucketName,
    "Pulumi output uploadsBucketName",
  );

  const d1Databases = requireArray(config.d1_databases, "d1_databases");
  d1Databases[0].database_name = requireString(
    outputs.databaseName,
    "Pulumi output databaseName",
  );
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
  console.log(`Loading Pulumi outputs from stack "${stackName}"...`);
  const outputs = await loadPulumiOutputs();

  // Make account ID available to all wrangler sub-processes (needed for pages deploy).
  process.env.CLOUDFLARE_ACCOUNT_ID = requireString(outputs.accountId, "Pulumi output accountId");

  const baseConfig = parseJson(await readFile(baseConfigPath, "utf8"), "wrangler.jsonc");
  const generatedConfig = buildWranglerConfig(baseConfig, outputs);

  await writeFile(generatedConfigPath, `${JSON.stringify(generatedConfig, null, 2)}\n`, "utf8");
  console.log(
    `Generated Wrangler config at ${path.relative(repoRoot, generatedConfigPath)} from Pulumi outputs.`,
  );

  console.log("Validating generated Worker config...");
  await run("wrangler", ["deploy", "--dry-run", "--config", generatedConfigPath]);

  if (dryRun) {
    console.log("Dry run complete; skipping deployment.");
    return;
  }

  console.log("Deploying Worker...");
  await run("wrangler", ["deploy", "--config", generatedConfigPath]);

  const pagesProjectName = outputs.pagesProjectName;

  if (pagesProjectName) {
    const workerUrl = await resolveWorkerUrl(outputs.accountId, outputs.workerScriptName);
    await setPagesEnvVar(outputs.accountId, pagesProjectName, "API_WORKER_URL", workerUrl);

    console.log(`Deploying Pages site to "${pagesProjectName}"...`);
    await run("wrangler", ["pages", "deploy", "pages", "--project-name", pagesProjectName]);
  }
}

async function cfApi(method, path, body) {
  const apiToken = requireString(process.env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN env var");
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(`Cloudflare API ${method} ${path} failed: ${JSON.stringify(data.errors)}`);
  }

  return data.result;
}

async function resolveWorkerUrl(accountId, workerScriptName) {
  const result = await cfApi("GET", `/accounts/${accountId}/workers/subdomain`);
  const subdomain = requireString(result?.subdomain, "workers.dev subdomain");
  const url = `https://${workerScriptName}.${subdomain}.workers.dev`;
  console.log(`Worker URL: ${url}`);
  return url;
}

async function setPagesEnvVar(accountId, projectName, key, value) {
  await cfApi("PATCH", `/accounts/${accountId}/pages/projects/${projectName}`, {
    deployment_configs: {
      production: { env_vars: { [key]: { value } } },
      preview: { env_vars: { [key]: { value } } },
    },
  });
  console.log(`Set Pages env var ${key}=${value} on "${projectName}".`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
