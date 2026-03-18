import { SERVICE_NAME } from "./application/hello";
import {
  enqueueDemoJob,
  getHelloDemo,
  handleDemoQueueBatch,
  readDemoArtifact,
  storeDemoArtifact,
  type DemoQueueJob,
} from "./services/demo";

function createHeaders(init: HeadersInit = {}, contentType?: string): Headers {
  const headers = new Headers(init);
  if (contentType) {
    headers.set("content-type", contentType);
  }
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("cache-control", "no-store");
  return headers;
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: createHeaders(init.headers, "application/json; charset=utf-8"),
  });
}

function text(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: createHeaders(init.headers, "text/plain; charset=utf-8"),
  });
}

async function readHelloName(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  const body = (await request.json().catch(() => null)) as
    | { name?: unknown }
    | null;

  if (!body || typeof body !== "object") {
    return null;
  }

  return typeof body.name === "string" ? body.name : null;
}

async function readJsonBody<T>(request: Request): Promise<T | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return (await request.json().catch(() => null)) as T | null;
}

function getR2DemoKey(pathname: string): string | null {
  const prefix = "/api/demo/r2/";

  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const key = decodeURIComponent(pathname.slice(prefix.length));
  return key.length > 0 ? key : null;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: createHeaders() });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return text("Hello from Cloudflare Workers.", { status: 200 });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: SERVICE_NAME,
        bindings: ["DB", "CACHE", "FILES", "JOBS"],
      });
    }

    if (request.method === "GET" && url.pathname === "/api/demo") {
      return json({
        ok: true,
        service: SERVICE_NAME,
        demos: [
          "/api/hello",
          "/api/demo/r2/:key",
          "/api/demo/queue",
        ],
      });
    }

    if (request.method === "GET" && url.pathname === "/api/hello") {
      return json(await getHelloDemo(env, url.searchParams.get("name")));
    }

    if (request.method === "POST" && url.pathname === "/api/hello") {
      return json(await getHelloDemo(env, await readHelloName(request)));
    }

    const r2Key = getR2DemoKey(url.pathname);

    if (r2Key) {
      if (request.method === "PUT") {
        return json(await storeDemoArtifact(env, r2Key, await request.text()), {
          status: 201,
        });
      }

      if (request.method === "GET") {
        const artifact = await readDemoArtifact(env, r2Key);

        if (!artifact) {
          return json(
            {
              ok: false,
              service: SERVICE_NAME,
              error: "Artifact not found",
            },
            { status: 404 },
          );
        }

        return json(artifact);
      }

      if (request.method === "DELETE") {
        await env.FILES.delete(r2Key);
        return new Response(null, { status: 204, headers: createHeaders() });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/demo/queue") {
      const body = await readJsonBody<{ name?: string }>(request);
      const job = await enqueueDemoJob(env, body?.name);

      return json(
        {
          ok: true,
          service: SERVICE_NAME,
          queue: "cf-boilerplate-jobs",
          job,
        },
        { status: 202 },
      );
    }

    return json(
      {
        ok: false,
        service: SERVICE_NAME,
        error: "Not Found",
      },
      { status: 404 },
    );
  },
  async queue(
    batch: MessageBatch<DemoQueueJob>,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await handleDemoQueueBatch(env, batch);
  },
} satisfies ExportedHandler<Env, DemoQueueJob>;
