import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import type { HelloApiResponse } from "../../shared/types/api";

describe("API contract", () => {
  it("returns the hello response shape", async () => {
    const response = await exports.default.fetch(
      new Request("https://example.com/api/hello?name=Cloudflare"),
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
