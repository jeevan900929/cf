// SERVICE_NAME is provided by the WASM module via getServiceName() in src/wasm.ts

export interface HelloApiResponse {
  ok: true;
  service: string;
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
  service: string;
  error: string;
}
