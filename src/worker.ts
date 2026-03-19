import { SERVICE_NAME } from "../shared/types/api";
import type { QueueJob } from "../shared/types/api";
import { login, authenticate } from "./auth/middleware";
import { getConfig } from "./services/config";
import { getHelloDemo, enqueueDemoJob, storeDemoArtifact, readDemoArtifact } from "./services/demo";
import { handleQueueBatch } from "./services/queue-consumer";

export { Room } from "./durable-objects/room";

function createHeaders(init: HeadersInit = {}, contentType?: string): Headers {
  const headers = new Headers(init);
  if (contentType) {
    headers.set("content-type", contentType);
  }
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,authorization");
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

async function readJsonBody<T>(request: Request): Promise<T | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  return (await request.json().catch(() => null)) as T | null;
}

function getRoomId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/rooms\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getRoomSubpath(pathname: string): string {
  const match = pathname.match(/^\/api\/rooms\/[^/]+(\/.*)?$/);
  return match?.[1] ?? "";
}

function getR2DemoKey(pathname: string): string | null {
  const prefix = "/api/demo/r2/";
  if (!pathname.startsWith(prefix)) return null;
  const key = decodeURIComponent(pathname.slice(prefix.length));
  return key.length > 0 ? key : null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: createHeaders() });
    }

    try {
      return await handleRequest(request, env);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error("Unhandled error:", err);
      return json({ ok: false, error: message }, { status: 500 });
    }
  },

  async queue(batch: MessageBatch<QueueJob>, env: Env): Promise<void> {
    await handleQueueBatch(env, batch);
  },
} satisfies ExportedHandler<Env, QueueJob>;

async function handleRequest(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // --- Public routes ---

    if (request.method === "GET" && pathname === "/") {
      return text("Hello from Cloudflare Workers.");
    }

    if (request.method === "GET" && pathname === "/health") {
      return json({
        ok: true,
        service: SERVICE_NAME,
        bindings: ["DB", "CACHE", "FILES", "JOBS", "ROOMS"],
      });
    }

    if (request.method === "POST" && pathname === "/api/auth/login") {
      const body = await readJsonBody<{ username?: string; password?: string }>(request);
      if (!body?.username || !body?.password) {
        return json({ ok: false, error: "Username and password required" }, { status: 400 });
      }
      try {
        const result = await login(env.CACHE, body.username, body.password);
        return json({ ok: true, ...result });
      } catch {
        return json({ ok: false, error: "Invalid credentials" }, { status: 401 });
      }
    }

    // --- Authenticated routes ---

    let user: { sub: string };
    try {
      user = await authenticate(request, env.CACHE);
    } catch {
      return json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (request.method === "GET" && pathname === "/api/config") {
      const config = await getConfig(env.CACHE);
      return json({ ok: true, config });
    }

    if (request.method === "GET" && pathname === "/api/hello") {
      return json(await getHelloDemo(env, url.searchParams.get("name")));
    }

    if (request.method === "POST" && pathname === "/api/hello") {
      const body = await readJsonBody<{ name?: string }>(request);
      return json(await getHelloDemo(env, body?.name));
    }

    // --- Room routes ---

    const roomId = getRoomId(pathname);
    if (roomId) {
      const id = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(id);
      const subpath = getRoomSubpath(pathname);

      if (subpath === "/websocket" && request.headers.get("Upgrade") === "websocket") {
        return stub.fetch(new Request("https://do/websocket?actor=" + encodeURIComponent(user.sub), {
          headers: request.headers,
        }));
      }

      if (request.method === "POST" && subpath === "/action") {
        return stub.fetch(new Request("https://do/action?actor=" + encodeURIComponent(user.sub), {
          method: "POST",
          headers: request.headers,
          body: request.body,
        }));
      }

      if (request.method === "GET" && subpath === "/state") {
        return stub.fetch(new Request("https://do/state"));
      }

      if (request.method === "GET" && subpath === "/history") {
        return stub.fetch(new Request("https://do/history"));
      }
    }

    // --- R2 demo ---

    const r2Key = getR2DemoKey(pathname);
    if (r2Key) {
      if (request.method === "PUT") {
        return json(await storeDemoArtifact(env, r2Key, await request.text()), { status: 201 });
      }
      if (request.method === "GET") {
        const artifact = await readDemoArtifact(env, r2Key);
        if (!artifact) {
          return json({ ok: false, error: "Artifact not found" }, { status: 404 });
        }
        return json(artifact);
      }
      if (request.method === "DELETE") {
        await env.FILES.delete(r2Key);
        return new Response(null, { status: 204, headers: createHeaders() });
      }
    }

    // --- Queue demo ---

    if (request.method === "POST" && pathname === "/api/demo/queue") {
      const body = await readJsonBody<{ name?: string }>(request);
      const job = await enqueueDemoJob(env, body?.name);
      return json({ ok: true, service: SERVICE_NAME, queue: "cf-boilerplate-jobs", job }, { status: 202 });
    }

    return json({ ok: false, service: SERVICE_NAME, error: "Not Found" }, { status: 404 });
}
