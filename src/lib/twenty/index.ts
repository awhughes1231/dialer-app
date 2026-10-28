import { getConfig } from "@/lib/config";
import { HttpTwentyClient } from "@/lib/twenty/http";
import { createMockTwentyClient } from "@/lib/twenty/mock";
import type { TwentyClient } from "@/lib/twenty/types";

let mockSingleton: TwentyClient | null = null;

export function getTwentyClient(): TwentyClient {
  const config = getConfig();
  if (config.twentyMode === "mock") {
    mockSingleton ??= createMockTwentyClient();
    return mockSingleton;
  }
  return new HttpTwentyClient({
    baseUrl: config.twentyApiUrl,
    apiKey: config.twentyApiKey,
  });
}
