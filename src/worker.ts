import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import type { QueueJob } from "../shared/types/api";
import { authMiddleware, login, authenticate } from "./auth/middleware";
import { getConfig } from "./services/config";
import { getHelloDemo, enqueueDemoJob, storeDemoArtifact, readDemoArtifact } from "./services/demo";
import { handleQueueBatch } from "./services/queue-consumer";
import { getServiceName } from "./wasm";

export { Room } from "./durable-objects/room";

const SERVICE = getServiceName();

interface EdgeInfo {
  colo: string;
  country: string;
  city: string;
}

type AppEnv = { Bindings: Env; Variables: { user: { sub: string }; edge: EdgeInfo | undefined } };

const app = new Hono<AppEnv>();

// Global error handler - returns JSON with CORS headers instead of Cloudflare 500 HTML
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ ok: false, error: err.message || "Internal server error", edge: c.get("edge") }, 500);
});

// Cache-control on all responses
app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("cache-control", "no-store");
});

// CORS
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// Edge info middleware
app.use("*", async (c, next) => {
  const cf = c.req.raw.cf as { colo?: string; country?: string; city?: string } | undefined;
  const edge = cf?.colo ? { colo: cf.colo, country: cf.country ?? "", city: cf.city ?? "" } : undefined;
  c.set("edge", edge);
  await next();
});

// --- DO stub helper ---

async function fetchRoom(c: Context<AppEnv>, path: string, init?: RequestInit): Promise<Response> {
  const roomId = c.req.param("roomId") as string;
  const stub = c.env.ROOMS.get(c.env.ROOMS.idFromName(roomId));
  const doRes = await stub.fetch(new Request(`https://do${path}`, init));
  const doBody = await doRes.json();
  return c.json({ ...(doBody as Record<string, unknown>), edge: c.get("edge") });
}

// --- Public routes ---

app.get("/", (c) => c.text("Hello from Cloudflare Workers."));

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: SERVICE,
    bindings: ["DB", "CACHE", "FILES", "JOBS", "ROOMS"],
    edge: c.get("edge"),
  });
});

app.post("/api/auth/login", async (c) => {
  const edge = c.get("edge");
  const body = await c.req.json<{ username?: string; password?: string }>().catch(() => null);
  if (!body?.username || !body?.password) {
    return c.json({ ok: false, error: "Username and password required", edge }, 400);
  }
  try {
    const result = await login(c.env.CACHE, body.username, body.password);
    return c.json({ ok: true, ...result, edge });
  } catch {
    return c.json({ ok: false, error: "Invalid credentials", edge }, 401);
  }
});

// --- WebSocket upgrade (before auth middleware; uses ?token= query param) ---

app.get("/api/rooms/:roomId/websocket", async (c) => {
  const edge = c.get("edge");
  if (c.req.header("Upgrade") !== "websocket") {
    return c.json({ ok: false, error: "Expected WebSocket upgrade", edge }, 400);
  }
  const wsToken = c.req.query("token");
  if (!wsToken) {
    return c.json({ ok: false, error: "Missing token", edge }, 401);
  }
  try {
    const wsUser = await authenticate(
      new Request(c.req.url, { headers: { Authorization: `Bearer ${wsToken}` } }),
      c.env.CACHE,
    );
    const roomId = c.req.param("roomId");
    const stub = c.env.ROOMS.get(c.env.ROOMS.idFromName(roomId));
    return stub.fetch(
      new Request("https://do/websocket?actor=" + encodeURIComponent(wsUser.sub), {
        headers: c.req.raw.headers,
      }),
    );
  } catch {
    return c.json({ ok: false, error: "Invalid token", edge }, 401);
  }
});

// --- Auth middleware for all /api/* routes below ---

app.use("/api/*", authMiddleware);

// --- Authenticated routes ---

app.get("/api/config", async (c) => {
  const config = await getConfig(c.env.CACHE);
  return c.json({ ok: true, config, edge: c.get("edge") });
});

app.get("/api/hello", async (c) => {
  const result = await getHelloDemo(c.env, c.req.query("name"));
  return c.json({ ...result, edge: c.get("edge") });
});

app.post("/api/hello", async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => null);
  const result = await getHelloDemo(c.env, body?.name);
  return c.json({ ...result, edge: c.get("edge") });
});

// --- Room routes ---

app.post("/api/rooms/:roomId/action", (c) => {
  const user = c.get("user");
  return fetchRoom(c, "/action?actor=" + encodeURIComponent(user.sub), {
    method: "POST",
    headers: c.req.raw.headers,
    body: c.req.raw.body,
  });
});

app.get("/api/rooms/:roomId/state", (c) => fetchRoom(c, "/state"));

app.get("/api/rooms/:roomId/history", (c) => fetchRoom(c, "/history"));

// --- R2 demo ---

app.put("/api/demo/r2/:key{.+}", async (c) => {
  const result = await storeDemoArtifact(c.env, c.req.param("key"), await c.req.text());
  return c.json({ ...result, edge: c.get("edge") }, 201);
});

app.get("/api/demo/r2/:key{.+}", async (c) => {
  const artifact = await readDemoArtifact(c.env, c.req.param("key"));
  if (!artifact) {
    return c.json({ ok: false, error: "Artifact not found", edge: c.get("edge") }, 404);
  }
  return c.json({ ...artifact, edge: c.get("edge") });
});

app.delete("/api/demo/r2/:key{.+}", async (c) => {
  await c.env.FILES.delete(c.req.param("key"));
  return c.body(null, 204);
});

// --- Queue demo ---

app.post("/api/demo/queue", async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => null);
  const job = await enqueueDemoJob(c.env, body?.name);
  return c.json(
    { ok: true, service: SERVICE, queue: "cf-boilerplate-jobs", job, edge: c.get("edge") },
    202,
  );
});

// --- 404 ---

app.all("*", (c) => {
  return c.json({ ok: false, service: SERVICE, error: "Not Found", edge: c.get("edge") }, 404);
});

// --- Export ---

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<QueueJob>, env: Env): Promise<void> {
    await handleQueueBatch(env, batch);
  },
} satisfies ExportedHandler<Env, QueueJob>;
