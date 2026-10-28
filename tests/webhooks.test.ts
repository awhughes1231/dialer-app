import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { applyClientEvent, applyProviderEvent, decodeClientState, parseTelnyxWebhook, type CallSnapshot } from "@/lib/telephony/events";
import { verifyTelnyxSignature } from "@/lib/telephony/signature";
import { telnyxRecordStartBody, telnyxSpeakBody, TwilioProvider } from "@/lib/telephony/telnyx";
import { processTelnyxWebhook, type CallStore } from "@/lib/telephony/webhook-handler";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
const raw = (publicKey.export({ type: "spki", format: "der" }) as Buffer).subarray(-32).toString("base64");

function signed(body: string, timestamp: string): string {
  return sign(null, Buffer.from(`${timestamp}|${body}`), privateKey).toString("base64");
}

function snapshot(overrides: Partial<CallSnapshot> = {}): CallSnapshot {
  return {
    id: "call-1",
    status: "DIALING",
    fromNumber: "+14155551000",
    toNumber: "+12125550198",
    startedAt: "2026-10-28T15:00:00.000Z",
    answeredAt: null,
    endedAt: null,
    durationSeconds: null,
    recordingUrl: null,
    recordingStatus: "PENDING",
    recordingMode: "record_with_disclosure",
    disclosureRequired: true,
    disclosurePlayed: false,
    telnyxCallControlId: null,
    telnyxCallSessionId: null,
    hangupCause: null,
    providerError: null,
    updatedAt: "2026-10-28T15:00:00.000Z",
    ...overrides,
  };
}

function memory(initial: CallSnapshot[]): CallStore & { calls: Map<string, CallSnapshot> } {
  const calls = new Map(initial.map((call) => [call.id, call]));
  const events = new Set<string>();
  return {
    calls,
    async findById(id) {
      return calls.get(id) ?? null;
    },
    async findByControlId(id) {
      return [...calls.values()].find((call) => call.telnyxCallControlId === id) ?? null;
    },
    async findActiveByNumbers(from, to) {
      return (
        [...calls.values()].find(
          (call) =>
            call.toNumber === to &&
            (!from || call.fromNumber === from) &&
            ["READY", "DIALING", "RINGING", "IN_PROGRESS", "ON_HOLD"].includes(call.status),
        ) ?? null
      );
    },
    async save(call) {
      calls.set(call.id, call);
    },
    async hasEvent(id) {
      return events.has(id);
    },
    async rememberEvent(id) {
      events.add(id);
    },
  };
}

describe("Telnyx signatures", () => {
  const body = JSON.stringify({ data: { id: "evt-1", event_type: "call.answered" } });
  const now = new Date("2026-10-28T15:00:00.000Z");
  const timestamp = String(Math.floor(now.getTime() / 1000));

  it("accepts a current Ed25519 signature from a PEM or raw portal key", () => {
    const signature = signed(body, timestamp);
    expect(verifyTelnyxSignature({ rawBody: body, signature, timestamp, publicKey: pem, toleranceSeconds: 300, now }).ok).toBe(true);
    expect(verifyTelnyxSignature({ rawBody: body, signature, timestamp, publicKey: raw, toleranceSeconds: 300, now }).ok).toBe(true);
  });

  it("rejects a bad signature and a stale timestamp", () => {
    const bad = verifyTelnyxSignature({
      rawBody: body,
      signature: signed(`${body} `, timestamp),
      timestamp,
      publicKey: pem,
      toleranceSeconds: 300,
      now,
    });
    expect(bad.ok).toBe(false);
    const stale = verifyTelnyxSignature({
      rawBody: body,
      signature: signed(body, "100"),
      timestamp: "100",
      publicKey: pem,
      toleranceSeconds: 300,
      now,
    });
    expect(stale.ok).toBe(false);
  });
});

describe("webhook handling", () => {
  const now = new Date("2026-10-28T15:00:30.000Z");
  const timestamp = String(Math.floor(now.getTime() / 1000));

  function payload(eventType: string, eventId: string, extra: Record<string, unknown> = {}) {
    return JSON.stringify({
      data: {
        id: eventId,
        event_type: eventType,
        occurred_at: now.toISOString(),
        payload: {
          call_control_id: "ctrl-1",
          call_session_id: "sess-1",
          from: "+14155551000",
          to: "+12125550198",
          client_state: Buffer.from(JSON.stringify({ callId: "call-1" })).toString("base64"),
          ...extra,
        },
      },
    });
  }

  async function post(rawBody: string, store: CallStore, telephony = { recordings: [] as string[], disclosures: [] as string[] }) {
    const provider = {
      async startRecording(id: string) {
        telephony.recordings.push(id);
      },
      async playDisclosure(id: string, text: string) {
        telephony.disclosures.push(`${id}:${text}`);
      },
    };
    return {
      telephony,
      result: await processTelnyxWebhook({
        rawBody,
        signature: signed(rawBody, timestamp),
        timestamp,
        publicKey: pem,
        toleranceSeconds: 300,
        now,
        store,
        telephony: provider,
        disclosureText: "This call may be recorded for quality and training purposes.",
      }),
    };
  }

  it("rejects a webhook before it touches the call", async () => {
    const store = memory([snapshot()]);
    const result = await processTelnyxWebhook({
      rawBody: payload("call.answered", "evt-bad"),
      signature: "not-a-signature",
      timestamp,
      publicKey: pem,
      toleranceSeconds: 300,
      now,
      store,
      telephony: { startRecording: async () => undefined, playDisclosure: async () => undefined },
      disclosureText: "notice",
    });
    expect(result.status).toBe(401);
    expect(store.calls.get("call-1")?.status).toBe("DIALING");
  });

  it("starts recording and the disclosure on answer, once", async () => {
    const store = memory([snapshot()]);
    const first = await post(payload("call.answered", "evt-answer"), store);
    expect(first.result.status).toBe(200);
    expect(first.telephony.recordings).toEqual(["ctrl-1"]);
    expect(first.telephony.disclosures).toHaveLength(1);
    expect(store.calls.get("call-1")?.status).toBe("IN_PROGRESS");
    const second = await post(payload("call.answered", "evt-answer"), store, first.telephony);
    expect(second.result.body.duplicate).toBe(true);
    expect(first.telephony.recordings).toEqual(["ctrl-1"]);
  });

  it("does not record when the call is in skip mode", async () => {
    const store = memory([snapshot({ recordingMode: "skip", recordingStatus: "SKIPPED", disclosureRequired: false })]);
    const { telephony, result } = await post(payload("call.answered", "evt-skip"), store);
    expect(result.status).toBe(200);
    expect(telephony.recordings).toEqual([]);
    expect(telephony.disclosures).toEqual([]);
  });

  it("stores the recording after hangup and keeps provider timestamps authoritative", () => {
    const answered = applyProviderEvent(
      snapshot(),
      parseTelnyxWebhook(JSON.parse(payload("call.answered", "evt-a", { }))) as Exclude<ReturnType<typeof parseTelnyxWebhook>, { error: string }>,
      now.toISOString(),
    ).call;
    const hungUp = applyProviderEvent(
      { ...answered, status: "IN_PROGRESS", answeredAt: "2026-10-28T15:00:10.000Z" },
      {
        eventId: "evt-h",
        eventType: "call.hangup",
        callId: "call-1",
        callControlId: "ctrl-1",
        callSessionId: "sess-1",
        from: null,
        to: null,
        occurredAt: "2026-10-28T15:03:10.000Z",
        recordingUrl: null,
        hangupCause: "normal_clearing",
      },
      now.toISOString(),
    ).call;
    expect(hungUp.durationSeconds).toBe(180);
    const saved = applyProviderEvent(
      hungUp,
      {
        eventId: "evt-r",
        eventType: "call.recording.saved",
        callId: "call-1",
        callControlId: "ctrl-1",
        callSessionId: null,
        from: null,
        to: null,
        occurredAt: null,
        recordingUrl: "https://recordings.example/call.mp3",
        hangupCause: null,
      },
      now.toISOString(),
    ).call;
    expect(saved.recordingUrl).toBe("https://recordings.example/call.mp3");
    expect(saved.recordingStatus).toBe("RECORDED");
    expect(saved.status).toBe("ENDED");
  });

  it("ignores an event for a call it cannot find and reads client state", async () => {
    const store = memory([]);
    const { result } = await post(payload("call.hangup", "evt-missing"), store);
    expect(result.body.ignored).toBe(true);
    expect(decodeClientState(Buffer.from(JSON.stringify({ callId: "call-9" })).toString("base64")).callId).toBe("call-9");
    const parsed = parseTelnyxWebhook(JSON.parse(payload("call.recording.saved", "evt-rec", { recording_urls: { mp3: "https://example/a.mp3" } })));
    expect("recordingUrl" in parsed && parsed.recordingUrl).toBe("https://example/a.mp3");
  });

  it("does not let the browser forge a recording URL or a disclosure in Telnyx mode", () => {
    const forged = applyClientEvent(snapshot(), "disclosure_played", now.toISOString(), { allowBrowserDisclosure: false });
    expect(forged.disclosurePlayed).toBe(false);
    expect(forged.recordingUrl).toBeNull();
    const ended = applyClientEvent(snapshot({ answeredAt: "2026-10-28T15:00:00.000Z", status: "IN_PROGRESS" }), "hangup", "2026-10-28T15:02:00.000Z", {
      allowBrowserDisclosure: false,
    });
    expect(ended.durationSeconds).toBe(120);
  });
});

describe("provider payloads", () => {
  it("builds the Telnyx record and disclosure commands and refuses Twilio", async () => {
    expect(telnyxRecordStartBody()).toMatchObject({ format: "mp3", channels: "single", play_beep: false });
    expect(telnyxSpeakBody("This call may be recorded for quality and training purposes").language).toBe("en-US");
    await expect(new TwilioProvider().mintBrowserLogin()).rejects.toThrow(/Twilio is not configured/);
  });
});
