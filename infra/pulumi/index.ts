import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

const accountId = config.require("accountId");
const apiToken = config.requireSecret("apiToken");
const zoneId = config.require("zoneId");
const domainName = config.require("domainName");
const projectName = config.get("projectName") ?? "cf-boilerplate";
const workerScriptName = config.get("workerScriptName") ?? "cf-boilerplate-api";

const provider = new cloudflare.Provider("cloudflare", {
  apiToken,
});

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

const apiRoute = new cloudflare.WorkersRoute(
  "apiRoute",
  {
    zoneId,
    pattern: `api.${domainName}/*`,
    script: workerScriptName,
  },
  { provider },
);

export const databaseId = d1Database.uuid;
export const databaseName = d1Database.name;
export const cacheNamespaceId = cacheNamespace.id;
export const uploadsBucketName = uploadsBucket.name;
export const queueName = jobsQueue.queueName;
export const queueId = jobsQueue.queueId;
export const pagesProjectName = pagesProject.name;
export const apiRoutePattern = apiRoute.pattern;
export { accountId, projectName, workerScriptName };
