import { exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import type { HelloApiResponse } from "../../shared/types/api";

let authToken: string;

async function loginForToken(): Promise<string> {
  const response = await exports.default.fetch(
    new Request("https://example.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "demo", password: "demo" }),
    }),
  );
  const body = (await response.json()) as { ok: true; token: string };
  return body.token;
}

describe("API contract", () => {
  beforeAll(async () => {
    authToken = await loginForToken();
  });

  it("returns the hello response shape", async () => {
    const response = await exports.default.fetch(
      new Request("https://example.com/api/hello?name=Cloudflare", {
        headers: { Authorization: `Bearer ${authToken}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = (await response.json()) as HelloApiResponse;

    expect(body).toEqual({
      ok: true,
      service: "cf-boilerplate",
      subject: "Cloudflare",
      message: "Hello, Cloudflare!",
      visits: 1,
      source: "d1",
    });
  });
});
