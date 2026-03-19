// Manual WASM initialization for Cloudflare Workers / miniflare.
//
// wasm-pack --target bundler produces cf_core.js that does:
//   import * as wasm from "./cf_core_bg.wasm";
//   __wbg_set_wasm(wasm);
//   wasm.__wbindgen_start();
//
// That assumes a bundler (webpack) that instantiates the WASM module on import.
// In workerd/miniflare, "import mod from 'x.wasm'" gives a WebAssembly.Module,
// so we instantiate it ourselves with the right imports.

import wasmModule from "../crates/core/pkg/cf_core_bg.wasm";
import * as bg from "../crates/core/pkg/cf_core_bg.js";

const instance = new WebAssembly.Instance(wasmModule, {
  "./cf_core_bg.js": bg,
});

bg.__wbg_set_wasm(instance.exports);
(instance.exports.__wbindgen_start as CallableFunction)();

export const normalizeSubject: (input?: string | null) => string = bg.normalizeSubject;
export const createGreetingJson: (input?: string | null) => string = bg.createGreeting;
export const buildHelloResponseJson: (name?: string | null) => string = bg.buildHelloResponse;
export const signJwt: (payload_json: string, secret: string) => string = bg.signJwt;
export const verifyJwt: (
  token: string,
  secret: string,
  current_timestamp_secs: number,
) => string | undefined = bg.verifyJwt;
export const renderTemplate: (template: string, vars_json: string) => string = bg.renderTemplate;
export const getServiceName: () => string = bg.SERVICE_NAME;

/** Parsed return from the WASM createGreeting function. */
export function createGreeting(input?: string | null): { subject: string; message: string } {
  return JSON.parse(createGreetingJson(input));
}

/** Parsed return from the WASM buildHelloResponse function. */
export function buildHelloResponse(input?: string | null): {
  ok: true;
  service: string;
  subject: string;
  message: string;
} {
  return JSON.parse(buildHelloResponseJson(input));
}
