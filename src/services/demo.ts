import { buildHelloResponse } from "../application/hello";
import { normalizeSubject } from "../domain/greeting";
import type { ArtifactApiResponse, HelloApiResponse, QueueJob } from "../../shared/types/api";

const HELLO_CACHE_PREFIX = "hello";

export interface DemoEnv {
  DB: D1Database;
  CACHE: KVNamespace;
  FILES: R2Bucket;
  JOBS: Queue;
}

type HelloPayload = Omit<HelloApiResponse, "source">;

function helloCacheKey(subject: string): string {
  return `${HELLO_CACHE_PREFIX}:${subject.toLowerCase()}`;
}

async function upsertGreetingCount(db: D1Database, subject: string): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO greeting_counts (name, visits, updated_at)
       VALUES (?, 1, ?)
       ON CONFLICT(name) DO UPDATE SET
         visits = greeting_counts.visits + 1,
         updated_at = excluded.updated_at
       RETURNING visits`,
    )
    .bind(subject, new Date().toISOString())
    .first<number>("visits");

  return row ?? 1;
}

export async function getHelloDemo(
  env: DemoEnv,
  name: string | null | undefined,
): Promise<HelloApiResponse> {
  const subject = normalizeSubject(name);
  const cacheKey = helloCacheKey(subject);
  const cached = await env.CACHE.get<HelloPayload>(cacheKey, "json");

  if (cached) {
    return {
      ...cached,
      source: "kv",
    };
  }

  const visits = await upsertGreetingCount(env.DB, subject);
  const payload: HelloPayload = {
    ...buildHelloResponse({ name: subject }),
    visits,
  };

  await env.CACHE.put(cacheKey, JSON.stringify(payload), { expirationTtl: 300 });

  return {
    ...payload,
    source: "d1",
  };
}

export async function storeDemoArtifact(
  env: Pick<DemoEnv, "FILES">,
  key: string,
  content: string,
): Promise<ArtifactApiResponse> {
  const object = await env.FILES.put(key, content, {
    httpMetadata: {
      contentType: "text/plain; charset=utf-8",
    },
  });

  return {
    ok: true,
    key: object.key,
    size: object.size,
    content,
  };
}

export async function readDemoArtifact(
  env: Pick<DemoEnv, "FILES">,
  key: string,
): Promise<ArtifactApiResponse | null> {
  const object = await env.FILES.get(key);

  if (!object) {
    return null;
  }

  return {
    ok: true,
    key: object.key,
    size: object.size,
    content: await object.text(),
  };
}

export async function enqueueDemoJob(
  env: Pick<DemoEnv, "JOBS">,
  name: string | null | undefined,
): Promise<QueueJob> {
  const subject = normalizeSubject(name);
  const job = {
    id: crypto.randomUUID(),
    name: subject,
    message: buildHelloResponse({ name: subject }).message,
    createdAt: new Date().toISOString(),
  };

  await env.JOBS.send(job);

  return job;
}

export async function handleDemoQueueBatch(
  env: Pick<DemoEnv, "DB">,
  batch: MessageBatch<QueueJob>,
): Promise<void> {
  const statements = batch.messages.map((message) =>
    env.DB
      .prepare(
        `INSERT INTO job_receipts (id, name, message, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(message.body.id, message.body.name, message.body.message, message.body.createdAt),
  );

  await env.DB.batch(statements);
  batch.ackAll();
}
