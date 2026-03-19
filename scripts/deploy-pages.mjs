import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pulumiDir = path.join(repoRoot, "infra", "pulumi");
const stackName = process.env.PULUMI_STACK_NAME ?? "prod";

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
    const { readFile } = await import("node:fs/promises");
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

async function setPagesEnvVar(accountId, projectName, key, value) {
  await cfApi("PATCH", `/accounts/${accountId}/pages/projects/${projectName}`, {
    deployment_configs: {
      production: { env_vars: { [key]: { value } } },
      preview: { env_vars: { [key]: { value } } },
    },
  });
  console.log(`Set Pages env var ${key}=${value} on "${projectName}".`);
}

async function main() {
  console.log(`Loading Pulumi outputs from stack "${stackName}"...`);
  const outputs = await loadPulumiOutputs();

  const accountId = requireString(outputs.accountId, "Pulumi output accountId");
  const pagesProjectName = requireString(outputs.pagesProjectName, "Pulumi output pagesProjectName");
  const workerUrl = requireString(process.env.CF_API_WORKER_URL, "CF_API_WORKER_URL env var");

  process.env.CLOUDFLARE_ACCOUNT_ID = accountId;

  await setPagesEnvVar(accountId, pagesProjectName, "API_WORKER_URL", workerUrl);

  console.log(`Deploying Pages site to "${pagesProjectName}"...`);
  await run("wrangler", ["pages", "deploy", "pages", "--project-name", pagesProjectName]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
