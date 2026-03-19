import { env, exports } from "cloudflare:workers";
import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import worker from "../../src/worker";
import type { HelloApiResponse, QueueJob } from "../../shared/types/api";

describe("worker integration", () => {
  it("caches greeting responses through KV and D1", async () => {
    const request = new Request("https://example.com/api/hello?name=Ada");

    const first = await exports.default.fetch(request);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      ok: true,
      service: "cf-boilerplate",
      subject: "Ada",
      message: "Hello, Ada!",
      visits: 1,
      source: "d1",
    });

    const cached = await env.CACHE.get<Omit<HelloApiResponse, "source">>("hello:ada", "json");
    expect(cached).toEqual({
      ok: true,
      service: "cf-boilerplate",
      subject: "Ada",
      message: "Hello, Ada!",
      visits: 1,
    });

    const second = await exports.default.fetch(request);
    expect(await second.json()).toEqual({
      ok: true,
      service: "cf-boilerplate",
      subject: "Ada",
      message: "Hello, Ada!",
      visits: 1,
      source: "kv",
    });

    const row = await env.DB.prepare(
      "SELECT visits FROM greeting_counts WHERE name = ?",
    )
      .bind("Ada")
      .first<number>("visits");

    expect(row).toBe(1);
  });

  it("stores and reads demo artifacts in R2", async () => {
    const put = await exports.default.fetch(
      new Request("https://example.com/api/demo/r2/pages.txt", {
        method: "PUT",
        body: "Hello from Pages.",
      }),
    );

    expect(put.status).toBe(201);
    expect(await put.json()).toEqual({
      ok: true,
      key: "pages.txt",
      size: "Hello from Pages.".length,
      content: "Hello from Pages.",
    });

    const get = await exports.default.fetch(
      new Request("https://example.com/api/demo/r2/pages.txt"),
    );

    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({
      ok: true,
      key: "pages.txt",
      size: "Hello from Pages.".length,
      content: "Hello from Pages.",
    });
  });

  it("enqueues demo jobs", async () => {
    const response = await exports.default.fetch(
      new Request("https://example.com/api/demo/queue", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Ada" }),
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      ok: true,
      service: "cf-boilerplate",
      queue: "cf-boilerplate-jobs",
      job: {
        name: "Ada",
        message: "Hello, Ada!",
      },
    });
  });

  it("records queue receipts in D1", async () => {
    const job = {
      id: "job-1",
      name: "Ada",
      message: "Hello, Ada!",
      createdAt: "2026-03-18T00:00:00.000Z",
    };

    const batch = createMessageBatch<QueueJob>("cf-boilerplate-jobs", [
      {
        id: "message-1",
        timestamp: new Date("2026-03-18T00:00:00.000Z"),
        attempts: 1,
        body: job,
      },
    ]);
    const ctx = createExecutionContext();

    await worker.queue(batch, env as Env, ctx);

    const result = await getQueueResult(batch, ctx);
    expect(result.ackAll).toBe(true);

    const row = await env.DB.prepare(
      "SELECT name, message FROM job_receipts WHERE id = ?",
    )
      .bind("job-1")
      .first<{ name: string; message: string }>();

    expect(row).toEqual({
      name: "Ada",
      message: "Hello, Ada!",
    });
  });

  it("supports preflight requests", async () => {
    const response = await exports.default.fetch(
      new Request("https://example.com/api/hello", {
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(204);
  });
});
