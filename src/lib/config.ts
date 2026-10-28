import { parseCallerIdEnv } from "@/lib/caller-id/select";
import { parseAllPartyStates } from "@/lib/compliance/recording";
import { parseClock } from "@/lib/compliance/hours";
import type { DialSettings } from "@/lib/compliance/decide";

export type AppConfig = {
  databaseUrl: string;
  authSecret: string;
  publicAppUrl: string;
  twentyMode: "mock" | "live";
  twentyApiUrl: string;
  twentyApiKey: string;
  twentyAppUrl: string;
  twentyMirrorNotes: boolean;
  twentyNextFollowUpField: string;
  telephonyMode: "mock" | "telnyx" | "twilio";
  telnyxApiKey: string;
  telnyxPublicKey: string;
  telnyxConnectionId: string;
  telnyxOutboundVoiceProfileId: string;
  telnyxDefaultCallerId: string;
  telnyxDisclosureAudioUrl: string;
  telnyxWebhookToleranceSeconds: number;
  allowedEmailDomain: string;
  allowedEmails: string[];
  adminEmails: string[];
  devLogin: boolean;
  googleClientId: string;
  googleClientSecret: string;
  seedDemoData: boolean;
  dial: DialSettings;
};

function requiredBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function mode<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const value = (process.env[name] ?? fallback).trim() as T;
  if (!allowed.includes(value)) throw new Error(`${name} must be one of ${allowed.join(", ")}`);
  return value;
}

let cached: AppConfig | null = null;

export function resetConfigForTests(): void {
  cached = null;
}

export function getConfig(): AppConfig {
  if (cached) return cached;
  const twentyKey = process.env.TWENTY_API_KEY?.trim() ?? "";
  const twentyMode = process.env.TWENTY_MODE?.trim();
  const resolvedTwentyMode: "mock" | "live" =
    twentyMode === "live" ? "live" : twentyMode === "mock" ? "mock" : twentyKey ? "live" : "mock";
  if (resolvedTwentyMode === "live" && !twentyKey) {
    throw new Error("TWENTY_MODE=live requires TWENTY_API_KEY");
  }
  const telephonyMode = mode("TELEPHONY_MODE", ["mock", "telnyx", "twilio"] as const, "mock");
  const publicAppUrl = (process.env.PUBLIC_APP_URL || process.env.AUTH_URL || "http://localhost:3010").replace(/\/$/, "");
  const twoPartyMode = mode("RECORDING_TWO_PARTY_MODE", ["announce", "skip"] as const, "announce");
  const unknownTimezone = mode("COMPLIANCE_UNKNOWN_TZ", ["block", "allow"] as const, "block");
  cached = {
    databaseUrl: process.env.DATABASE_URL ?? "",
    authSecret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "",
    publicAppUrl,
    twentyMode: resolvedTwentyMode,
    twentyApiUrl: process.env.TWENTY_API_URL?.trim() || "https://crm.ecommercewala.co",
    twentyApiKey: twentyKey,
    twentyAppUrl: (process.env.TWENTY_APP_URL || "https://crm.ecommercewala.co").replace(/\/$/, ""),
    twentyMirrorNotes: requiredBool("TWENTY_MIRROR_NOTES", true),
    twentyNextFollowUpField: process.env.TWENTY_NEXT_FOLLOW_UP_FIELD?.trim() || "nextFollowUp",
    telephonyMode,
    telnyxApiKey: process.env.TELNYX_API_KEY?.trim() ?? "",
    telnyxPublicKey: process.env.TELNYX_PUBLIC_KEY?.trim() ?? "",
    telnyxConnectionId: process.env.TELNYX_CONNECTION_ID?.trim() ?? "",
    telnyxOutboundVoiceProfileId: process.env.TELNYX_OUTBOUND_VOICE_PROFILE_ID?.trim() ?? "",
    telnyxDefaultCallerId: process.env.TELNYX_DEFAULT_CALLER_ID?.trim() ?? "",
    telnyxDisclosureAudioUrl: process.env.TELNYX_DISCLOSURE_AUDIO_URL?.trim() ?? "",
    telnyxWebhookToleranceSeconds: Number(process.env.TELNYX_WEBHOOK_TOLERANCE_SECONDS ?? 300),
    allowedEmailDomain: (process.env.ALLOWED_EMAIL_DOMAIN ?? "ecommercewala.co").trim().toLowerCase(),
    allowedEmails: splitList(process.env.ALLOWED_EMAILS),
    adminEmails: splitList(process.env.ADMIN_EMAILS),
    devLogin: process.env.AUTH_DEV_LOGIN === "true",
    googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() ?? "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "",
    seedDemoData: process.env.SEED_DEMO_DATA === "true",
    dial: {
      allPartyStates: parseAllPartyStates(process.env.ALL_PARTY_STATES),
      twoPartyMode,
      announceInOneParty: requiredBool("RECORDING_ANNOUNCE_IN_ONE_PARTY", true),
      unknownTimezone,
      allowDemoNumbers: telephonyMode !== "telnyx",
      defaultCallerId: process.env.TELNYX_DEFAULT_CALLER_ID?.trim() || null,
      windowStartMinutes: parseClock(process.env.CALLING_WINDOW_START, "08:00"),
      windowEndMinutes: parseClock(process.env.CALLING_WINDOW_END, "21:00"),
    },
  };
  const callerIds = parseCallerIdEnv(process.env.CALLER_ID_NUMBERS);
  if (callerIds.errors.length > 0) {
    cached = null;
    throw new Error(callerIds.errors.join("; "));
  }
  return cached;
}

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export const TELNYX_WEBHOOK_PATH = "/api/webhooks/telnyx";
