const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function base64urlEncode(text: string): string {
  return base64url(encoder.encode(text));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function generateSecret(): Promise<string> {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  return base64url(buffer.buffer);
}

export async function signJwt(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64urlEncode(JSON.stringify(payload));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${header}.${body}`),
  );
  return `${header}.${body}.${base64url(signature)}`;
}

export async function verifyJwt(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const key = await hmacKey(secret);

  const sigBytes = base64urlDecode(sig);
  const sigBuffer = new Uint8Array(sigBytes).buffer as ArrayBuffer;
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBuffer,
    encoder.encode(`${header}.${body}`),
  );

  if (!valid) return null;

  const payload = JSON.parse(decoder.decode(base64urlDecode(body)));
  if (payload.exp && Date.now() / 1000 > payload.exp) return null;

  return payload;
}
