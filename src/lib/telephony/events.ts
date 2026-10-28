export type CallSnapshot = {
  id: string;
  status: string;
  fromNumber: string | null;
  toNumber: string;
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  recordingUrl: string | null;
  recordingStatus: string;
  recordingMode: string | null;
  disclosureRequired: boolean;
  disclosurePlayed: boolean;
  telnyxCallControlId: string | null;
  telnyxCallSessionId: string | null;
  hangupCause: string | null;
  providerError: string | null;
  updatedAt: string;
};

export type ProviderEffect =
  | { type: "start_recording" }
  | { type: "play_disclosure" }
  | { type: "hangup" };

export type ParsedProviderEvent = {
  eventId: string;
  eventType: string;
  callId: string | null;
  callControlId: string | null;
  callSessionId: string | null;
  from: string | null;
  to: string | null;
  occurredAt: string | null;
  recordingUrl: string | null;
  hangupCause: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function decodeClientState(value: unknown): { callId?: string } {
  if (typeof value !== "string" || !value.trim()) return {};
  const tryParse = (text: string): { callId?: string } => {
    try {
      const parsed = JSON.parse(text) as unknown;
      const record = asRecord(parsed);
      return typeof record?.callId === "string" ? { callId: record.callId } : {};
    } catch {
      return {};
    }
  };
  const direct = tryParse(value);
  if (direct.callId) return direct;
  try {
    return tryParse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

function headerValue(payload: Record<string, unknown>, name: string): string | null {
  const headers = payload.custom_headers ?? payload.customHeaders;
  if (!Array.isArray(headers)) return null;
  for (const header of headers) {
    const record = asRecord(header);
    if (!record) continue;
    const headerName = String(record.name ?? "");
    if (headerName.toLowerCase() === name.toLowerCase() && typeof record.value === "string") return record.value;
  }
  return null;
}

function recordingUrlFrom(payload: Record<string, unknown>): string | null {
  const urls = asRecord(payload.recording_urls) ?? asRecord(payload.public_recording_urls);
  if (!urls) return null;
  if (typeof urls.mp3 === "string") return urls.mp3;
  if (typeof urls.wav === "string") return urls.wav;
  return null;
}

export function parseTelnyxWebhook(body: unknown): ParsedProviderEvent | { error: string } {
  const root = asRecord(body);
  const data = asRecord(root?.data);
  if (!data) return { error: "Telnyx webhook is missing data" };
  const eventType = typeof data.event_type === "string" ? data.event_type : "";
  const eventId = typeof data.id === "string" ? data.id : "";
  if (!eventType || !eventId) return { error: "Telnyx webhook is missing event id or type" };
  const payload = asRecord(data.payload) ?? {};
  const clientState = decodeClientState(payload.client_state ?? payload.clientState);
  const callId = clientState.callId ?? headerValue(payload, "X-ECW-Call-Id");
  return {
    eventId,
    eventType,
    callId,
    callControlId: typeof payload.call_control_id === "string" ? payload.call_control_id : null,
    callSessionId: typeof payload.call_session_id === "string" ? payload.call_session_id : null,
    from: typeof payload.from === "string" ? payload.from : null,
    to: typeof payload.to === "string" ? payload.to : null,
    occurredAt: typeof data.occurred_at === "string" ? data.occurred_at : null,
    recordingUrl: recordingUrlFrom(payload),
    hangupCause: typeof payload.hangup_cause === "string" ? payload.hangup_cause : null,
  };
}

function withDuration(call: CallSnapshot): CallSnapshot {
  if (!call.answeredAt || !call.endedAt) return call;
  const durationSeconds = Math.max(0, Math.round((Date.parse(call.endedAt) - Date.parse(call.answeredAt)) / 1000));
  return { ...call, durationSeconds };
}

export function applyProviderEvent(
  call: CallSnapshot,
  event: ParsedProviderEvent,
  nowIso: string,
): { call: CallSnapshot; effects: ProviderEffect[] } {
  const effects: ProviderEffect[] = [];
  let next: CallSnapshot = {
    ...call,
    updatedAt: nowIso,
    telnyxCallControlId: event.callControlId ?? call.telnyxCallControlId,
    telnyxCallSessionId: event.callSessionId ?? call.telnyxCallSessionId,
  };
  const at = event.occurredAt ?? nowIso;

  switch (event.eventType) {
    case "call.initiated":
      if (next.status === "READY" || next.status === "DIALING") next.status = "DIALING";
      next.startedAt = next.startedAt ?? at;
      break;
    case "call.ringing":
    case "call.bridged":
      if (next.status !== "ENDED" && next.status !== "FAILED") next.status = "RINGING";
      break;
    case "call.answered":
      if (next.status !== "ENDED") {
        next.status = "IN_PROGRESS";
        next.answeredAt = next.answeredAt ?? at;
        next.startedAt = next.startedAt ?? at;
        if (next.recordingMode === "record" || next.recordingMode === "record_with_disclosure") {
          if (next.recordingStatus === "PENDING") effects.push({ type: "start_recording" });
        }
        if (next.disclosureRequired && !next.disclosurePlayed) effects.push({ type: "play_disclosure" });
      }
      break;
    case "call.speak.ended":
    case "call.playback.ended":
      if (next.disclosureRequired) next.disclosurePlayed = true;
      break;
    case "call.recording.saved":
      if (event.recordingUrl) {
        next.recordingUrl = event.recordingUrl;
        next.recordingStatus = "RECORDED";
      }
      break;
    case "call.recording.error":
      next.recordingStatus = "FAILED";
      next.providerError = next.providerError ?? "Telnyx recording failed";
      break;
    case "call.hangup":
      if (next.status !== "ENDED") {
        next.status = "ENDED";
        next.endedAt = at;
        next.hangupCause = event.hangupCause;
        if (!next.answeredAt) next.durationSeconds = 0;
      } else if (event.occurredAt) {
        next.endedAt = event.occurredAt;
      }
      next = withDuration(next);
      break;
    default:
      break;
  }
  return { call: next, effects };
}

export type ClientCallEvent = "dialing" | "ringing" | "answered" | "hold" | "unhold" | "hangup" | "failed" | "disclosure_played";

export function applyClientEvent(
  call: CallSnapshot,
  type: ClientCallEvent,
  nowIso: string,
  options: { allowBrowserDisclosure: boolean },
): CallSnapshot {
  let next: CallSnapshot = { ...call, updatedAt: nowIso };
  if (type === "disclosure_played") {
    if (options.allowBrowserDisclosure) next.disclosurePlayed = true;
    return next;
  }
  if (next.status === "ENDED" || next.status === "FAILED" || next.status === "BLOCKED") return next;
  switch (type) {
    case "dialing":
      next.status = "DIALING";
      next.startedAt = next.startedAt ?? nowIso;
      break;
    case "ringing":
      next.status = "RINGING";
      next.startedAt = next.startedAt ?? nowIso;
      break;
    case "answered":
      next.status = "IN_PROGRESS";
      next.answeredAt = next.answeredAt ?? nowIso;
      next.startedAt = next.startedAt ?? nowIso;
      break;
    case "hold":
      if (next.status === "IN_PROGRESS") next.status = "ON_HOLD";
      break;
    case "unhold":
      if (next.status === "ON_HOLD") next.status = "IN_PROGRESS";
      break;
    case "hangup":
      next.status = "ENDED";
      next.endedAt = next.endedAt ?? nowIso;
      if (!next.answeredAt) next.durationSeconds = 0;
      next = withDuration(next);
      break;
    case "failed":
      next.status = "FAILED";
      next.endedAt = next.endedAt ?? nowIso;
      break;
    default:
      break;
  }
  return next;
}
