import { readFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const pulumiDir = path.join(repoRoot, "infra", "pulumi");
export const stackName = process.env.PULUMI_STACK_NAME ?? "prod";

export function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse ${label}: ${message}`);
  }
}

export function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required ${label}.`);
  }
  return value;
}

export function run(command, args, cwd = repoRoot) {
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

export async function loadPulumiOutputs() {
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
