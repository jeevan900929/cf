import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

const accountId = config.require("accountId");
const zoneId = config.get("zoneId");
const domainName = config.get("domainName");
const projectName = config.get("projectName") ?? "cf-boilerplate";
const workerScriptName = config.get("workerScriptName") ?? "cf-boilerplate-api";

// The Cloudflare provider reads CLOUDFLARE_API_TOKEN from env automatically.
const provider = new cloudflare.Provider("cloudflare");

const d1Database = new cloudflare.D1Database(
  "appDatabase",
  {
    accountId,
    name: `${projectName}-db`,
    primaryLocationHint: "wnam",
  },
  { provider },
);

const cacheNamespace = new cloudflare.WorkersKvNamespace(
  "appCache",
  {
    accountId,
    title: `${projectName}-cache`,
  },
  { provider },
);

const uploadsBucket = new cloudflare.R2Bucket(
  "appUploads",
  {
    accountId,
    name: `${projectName}-uploads`,
    location: "wnam",
  },
  { provider },
);

const jobsQueue = new cloudflare.Queue(
  "appJobs",
  {
    accountId,
    queueName: `${projectName}-jobs`,
  },
  { provider },
);

const pagesProject = new cloudflare.PagesProject(
  "webApp",
  {
    accountId,
    name: `${projectName}-web`,
    productionBranch: "main",
  },
  { provider },
);

if ((zoneId && !domainName) || (!zoneId && domainName)) {
  throw new Error("zoneId and domainName must be set together when using a custom zone.");
}

const apiRoute =
  zoneId && domainName
    ? new cloudflare.WorkersRoute(
        "apiRoute",
        {
          zoneId,
          pattern: `api.${domainName}/*`,
          script: workerScriptName,
        },
        { provider },
      )
    : undefined;

export const databaseId = d1Database.uuid;
export const databaseName = d1Database.name;
export const cacheNamespaceId = cacheNamespace.id;
export const uploadsBucketName = uploadsBucket.name;
export const queueName = jobsQueue.queueName;
export const queueId = jobsQueue.queueId;
export const pagesProjectName = pagesProject.name;
export { accountId, projectName, workerScriptName };
