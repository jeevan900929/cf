import { createGreeting } from "../domain/greeting";
import { SERVICE_NAME } from "../../shared/types/api";

export { SERVICE_NAME };

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
