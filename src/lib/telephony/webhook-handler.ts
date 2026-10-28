import { verifyTelnyxSignature } from "@/lib/telephony/signature";
import {
  applyProviderEvent,
  parseTelnyxWebhook,
  type CallSnapshot,
  type ProviderEffect,
} from "@/lib/telephony/events";

export type CallStore = {
  findById(id: string): Promise<CallSnapshot | null>;
  findByControlId(id: string): Promise<CallSnapshot | null>;
  findActiveByNumbers(from: string | null, to: string | null): Promise<CallSnapshot | null>;
  save(call: CallSnapshot): Promise<void>;
  hasEvent(id: string): Promise<boolean>;
  rememberEvent(id: string, type: string): Promise<void>;
};

export type WebhookTelephony = {
  startRecording(callControlId: string): Promise<void>;
  playDisclosure(callControlId: string, text: string): Promise<void>;
};

export async function processTelnyxWebhook(input: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  publicKey: string;
  toleranceSeconds: number;
  now: Date;
  store: CallStore;
  telephony: WebhookTelephony;
  disclosureText: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const verified = verifyTelnyxSignature({
    rawBody: input.rawBody,
    signature: input.signature,
    timestamp: input.timestamp,
    publicKey: input.publicKey,
    toleranceSeconds: input.toleranceSeconds,
    now: input.now,
  });
  if (!verified.ok) return { status: 401, body: { error: verified.reason } };

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(input.rawBody);
  } catch {
    return { status: 400, body: { error: "Webhook body is not JSON" } };
  }
  const parsed = parseTelnyxWebhook(parsedJson);
  if ("error" in parsed) return { status: 400, body: { error: parsed.error } };

  if (await input.store.hasEvent(parsed.eventId)) {
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  const call =
    (parsed.callId ? await input.store.findById(parsed.callId) : null) ??
    (parsed.callControlId ? await input.store.findByControlId(parsed.callControlId) : null) ??
    (await input.store.findActiveByNumbers(parsed.from, parsed.to));

  if (!call) {
    await input.store.rememberEvent(parsed.eventId, parsed.eventType);
    return { status: 200, body: { ok: true, ignored: true } };
  }

  const applied = applyProviderEvent(call, parsed, input.now.toISOString());
  const effectsRun: ProviderEffect["type"][] = [];
  if (applied.call.telnyxCallControlId) {
    for (const effect of applied.effects) {
      try {
        if (effect.type === "start_recording") {
          await input.telephony.startRecording(applied.call.telnyxCallControlId);
          applied.call.recordingStatus = applied.call.recordingStatus === "PENDING" ? "PENDING" : applied.call.recordingStatus;
        } else if (effect.type === "play_disclosure") {
          await input.telephony.playDisclosure(applied.call.telnyxCallControlId, input.disclosureText);
        }
        effectsRun.push(effect.type);
      } catch (error) {
        applied.call.providerError = error instanceof Error ? error.message : "Telnyx command failed";
        if (effect.type === "start_recording") applied.call.recordingStatus = "FAILED";
      }
    }
  }
  await input.store.save(applied.call);
  await input.store.rememberEvent(parsed.eventId, parsed.eventType);
  return { status: 200, body: { ok: true, callId: applied.call.id, effects: effectsRun } };
}
