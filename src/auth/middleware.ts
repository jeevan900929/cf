import { createMiddleware } from "hono/factory";
import { signJwt, verifyJwt } from "../wasm";
import type { JwtPayload } from "../../shared/types/auth";

const JWT_SECRET_KEY = "auth:jwt-secret";
const TOKEN_TTL = 3600;

async function generateSecret(): Promise<string> {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getJwtSecret(kv: KVNamespace): Promise<string> {
  let secret = await kv.get(JWT_SECRET_KEY);
  if (!secret) {
    secret = await generateSecret();
    await kv.put(JWT_SECRET_KEY, secret);
  }
  return secret;
}

export async function login(
  kv: KVNamespace,
  username: string,
  password: string,
): Promise<{ token: string; expiresIn: number }> {
  if (username !== "demo" || password !== "demo") {
    throw new Error("Invalid credentials");
  }

  const secret = await getJwtSecret(kv);
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: username, iat: now, exp: now + TOKEN_TTL };
  const token = signJwt(JSON.stringify(payload), secret);

  return { token, expiresIn: TOKEN_TTL };
}

export async function authenticate(
  request: Request,
  kv: KVNamespace,
): Promise<JwtPayload> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw new Error("Missing bearer token");
  }

  const secret = await kv.get(JWT_SECRET_KEY);
  if (!secret) {
    throw new Error("Auth not initialized");
  }

  const result = verifyJwt(auth.slice(7), secret, Math.floor(Date.now() / 1000));
  if (!result) {
    throw new Error("Invalid or expired token");
  }

  return JSON.parse(result) as JwtPayload;
}

export const authMiddleware = createMiddleware(async (c, next) => {
  try {
    const user = await authenticate(c.req.raw, (c.env as Env).CACHE);
    c.set("user", user);
    await next();
  } catch {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }
});
