import type { QueueJob } from "../../shared/types/api";

const TEMPLATE_KEY = "templates/job-result.txt";
const DEFAULT_TEMPLATE = "Job {{id}} for {{name}}: {{message}} (processed at {{processedAt}})";

async function getTemplate(r2: R2Bucket): Promise<string> {
  const obj = await r2.get(TEMPLATE_KEY);
  if (obj) return obj.text();

  await r2.put(TEMPLATE_KEY, DEFAULT_TEMPLATE, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });
  return DEFAULT_TEMPLATE;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

export async function handleQueueBatch(
  env: { DB: D1Database; FILES: R2Bucket },
  batch: MessageBatch<QueueJob>,
): Promise<void> {
  const template = await getTemplate(env.FILES);
  const processedAt = new Date().toISOString();

  const statements = [];
  for (const message of batch.messages) {
    const job = message.body;
    const rendered = renderTemplate(template, {
      id: job.id,
      name: job.name,
      message: job.message,
      processedAt,
    });

    let externalStatus: number | null = null;
    try {
      const resp = await fetch("https://httpbin.org/post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: job.id, rendered }),
      });
      externalStatus = resp.status;
    } catch {
      // External call failed; record null status
    }

    statements.push(
      env.DB
        .prepare(
          `INSERT INTO processed_jobs (id, name, message, template_key, rendered_output, external_status, created_at, processed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(job.id, job.name, job.message, TEMPLATE_KEY, rendered, externalStatus, job.createdAt, processedAt),
    );
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }
  batch.ackAll();
}
