import { createGreeting } from "../domain/greeting";

export const SERVICE_NAME = "cf-boilerplate" as const;

export interface HelloInput {
  name?: string | null;
}

export interface HelloResponse {
  ok: true;
  service: typeof SERVICE_NAME;
  subject: string;
  message: string;
}

export function buildHelloResponse(input: HelloInput = {}): HelloResponse {
  const greeting = createGreeting(input.name);

  return {
    ok: true,
    service: SERVICE_NAME,
    subject: greeting.subject,
    message: greeting.message,
  };
}
