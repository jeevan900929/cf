export interface Greeting {
  subject: string;
  message: string;
}

export function normalizeSubject(input: string | null | undefined): string {
  const trimmed = input?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Cloudflare";
}

export function createGreeting(input: string | null | undefined): Greeting {
  const subject = normalizeSubject(input);
  return {
    subject,
    message: `Hello, ${subject}!`,
  };
}
