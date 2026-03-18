import { buildHelloResponse } from "../application/hello";
import { normalizeSubject } from "../domain/greeting";

const HELLO_CACHE_PREFIX = "hello";

export interface DemoEnv {
  DB: D1Database;
  CACHE: KVNamespace;
  FILES: R2Bucket;
  JOBS: Queue;
}

export type DemoHelloPayload = ReturnType<typeof buildHelloResponse> & {
  visits: number;
};

export interface DemoHelloResponse extends DemoHelloPayload {
  source: "d1" | "kv";
}

export interface DemoArtifactResponse {
  ok: true;
  key: string;
  size: number;
  content: string;
}

export interface DemoQueueJob {
  id: string;
  name: string;
  message: string;
  createdAt: string;
}

function helloCacheKey(subject: string): string {
  return `${HELLO_CACHE_PREFIX}:${subject.toLowerCase()}`;
}

async function upsertGreetingCount(db: D1Database, subject: string): Promise<number> {
  const timestamp = new Date().toISOString();

  const current = await db
    .prepare("SELECT visits FROM greeting_counts WHERE name = ?")
    .bind(subject)
    .first<number>("visits");

  const next = (current ?? 0) + 1;

  await db
    .prepare(
      `INSERT INTO greeting_counts (name, visits, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         visits = ?,
         updated_at = excluded.updated_at`,
    )
    .bind(subject, next, timestamp, next)
    .run();

  return next;
}

export async function getHelloDemo(
  env: DemoEnv,
  name: string | null | undefined,
): Promise<DemoHelloResponse> {
  const subject = normalizeSubject(name);
  const cacheKey = helloCacheKey(subject);
  const cached = await env.CACHE.get<DemoHelloPayload>(cacheKey, "json");

  if (cached) {
    return {
      ...cached,
      source: "kv",
    };
  }

  const visits = await upsertGreetingCount(env.DB, subject);
  const payload: DemoHelloPayload = {
    ...buildHelloResponse({ name: subject }),
    visits,
  };

  await env.CACHE.put(cacheKey, JSON.stringify(payload));

  return {
    ...payload,
    source: "d1",
  };
}

export async function storeDemoArtifact(
  env: Pick<DemoEnv, "FILES">,
  key: string,
  content: string,
): Promise<DemoArtifactResponse> {
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
): Promise<DemoArtifactResponse | null> {
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
): Promise<DemoQueueJob> {
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
  batch: MessageBatch<DemoQueueJob>,
): Promise<void> {
  for (const message of batch.messages) {
    const job = message.body;

    await env.DB
      .prepare(
        `INSERT INTO job_receipts (id, name, message, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(job.id, job.name, job.message, job.createdAt)
      .run();
  }

  batch.ackAll();
}
