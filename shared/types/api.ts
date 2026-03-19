export const SERVICE_NAME = "cf-boilerplate" as const;

export interface HelloApiResponse {
  ok: true;
  service: typeof SERVICE_NAME;
  subject: string;
  message: string;
  visits: number;
  source: "d1" | "kv";
}

export interface ArtifactApiResponse {
  ok: true;
  key: string;
  size: number;
  content: string;
}

export interface QueueJob {
  id: string;
  name: string;
  message: string;
  createdAt: string;
}

export interface ErrorApiResponse {
  ok: false;
  service: typeof SERVICE_NAME;
  error: string;
}
