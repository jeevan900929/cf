import { generateSecret, signJwt, verifyJwt } from "./jwt";
import type { JwtPayload } from "../../shared/types/auth";

const JWT_SECRET_KEY = "auth:jwt-secret";
const TOKEN_TTL = 3600;

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
  const token = await signJwt(
    { sub: username, iat: now, exp: now + TOKEN_TTL },
    secret,
  );

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

  const payload = await verifyJwt(auth.slice(7), secret);
  if (!payload) {
    throw new Error("Invalid or expired token");
  }

  return payload as unknown as JwtPayload;
}
