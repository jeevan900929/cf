/* tslint:disable */
/* eslint-disable */

export function __wbg_set_wasm(val: WebAssembly.Exports): void;

export function SERVICE_NAME(): string;
export function buildHelloResponse(name?: string | null): string;
export function createGreeting(input?: string | null): string;
export function normalizeSubject(input?: string | null): string;
export function renderTemplate(template: string, vars_json: string): string;
export function signJwt(payload_json: string, secret: string): string;
export function verifyJwt(
  token: string,
  secret: string,
  current_timestamp_secs: number,
): string | undefined;

export function __wbg_Error_83742b46f01ce22d(arg0: number, arg1: number): Error;
export function __wbindgen_init_externref_table(): void;
