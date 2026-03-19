import { describe, expect, it } from "vitest";

import { buildHelloResponse, createGreeting, normalizeSubject } from "../../src/wasm";

describe("greeting domain", () => {
  it("defaults to Cloudflare", () => {
    expect(normalizeSubject(undefined)).toBe("Cloudflare");
    expect(normalizeSubject("")).toBe("Cloudflare");
  });

  it("trims the provided name", () => {
    expect(normalizeSubject("  Ada  ")).toBe("Ada");
  });

  it("creates a stable hello response", () => {
    expect(createGreeting("  Cloudflare  ")).toEqual({
      subject: "Cloudflare",
      message: "Hello, Cloudflare!",
    });

    expect(buildHelloResponse("Cloudflare")).toEqual({
      ok: true,
      service: "cf-boilerplate",
      subject: "Cloudflare",
      message: "Hello, Cloudflare!",
    });
  });
});
