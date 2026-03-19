import type { AppConfig } from "../../shared/types/config";

const CONFIG_KEY = "config:app";

const DEFAULT_CONFIG: AppConfig = {
  featureWebSocket: true,
  featureQueue: true,
  featureR2: true,
  maxRoomSize: 50,
  greeting: "Hello",
};

export async function getConfig(kv: KVNamespace): Promise<AppConfig> {
  const cached = await kv.get<AppConfig>(CONFIG_KEY, "json");
  if (cached) return cached;

  await kv.put(CONFIG_KEY, JSON.stringify(DEFAULT_CONFIG), {
    expirationTtl: 3600,
  });
  return DEFAULT_CONFIG;
}
