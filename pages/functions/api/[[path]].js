/**
 * Proxy all /api/* requests to the Worker.
 *
 * In prod:  API_WORKER_URL is set as a Cloudflare Pages environment variable
 *           by scripts/deploy-worker.mjs on every deploy.
 * In local: defaults to http://localhost:8787 (wrangler dev).
 */
export async function onRequest({ request, env }) {
  const base = (env.API_WORKER_URL ?? "http://localhost:8787").replace(/\/$/, "");
  const url = new URL(request.url);
  const target = `${base}${url.pathname}${url.search}`;

  return fetch(target, {
    method: request.method,
    headers: request.headers,
    body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
  });
}
