export const DISPOSITIONS = [
  { value: "CONNECTED", label: "Connected" },
  { value: "VOICEMAIL", label: "Voicemail" },
  { value: "NO_ANSWER", label: "No answer" },
  { value: "BAD_NUMBER", label: "Bad number" },
  { value: "MEETING_BOOKED", label: "Meeting booked" },
  { value: "NOT_INTERESTED", label: "Not interested" },
] as const;

export type Disposition = (typeof DISPOSITIONS)[number]["value"];

const VALUES = new Set<string>(DISPOSITIONS.map((item) => item.value));

export function dispositionLabel(value: string | null | undefined): string {
  return DISPOSITIONS.find((item) => item.value === value)?.label ?? value ?? "—";
}

export function normalizeDisposition(value: unknown): Disposition | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return VALUES.has(upper) ? (upper as Disposition) : null;
}

export const LIVE_CALL_STATUSES = ["DIALING", "RINGING", "IN_PROGRESS", "ON_HOLD"] as const;

export const STALE_LIVE_CALL_MS = 2 * 60 * 60 * 1000;

export function isStaleLiveCall(status: string, updatedAt: Date, now: Date): boolean {
  if (!LIVE_CALL_STATUSES.includes(status as (typeof LIVE_CALL_STATUSES)[number])) return false;
  return now.getTime() - updatedAt.getTime() >= STALE_LIVE_CALL_MS;
}

export function liveCallBlock(calls: { status: string; updatedAt: Date }[], now: Date): string | null {
  const live = calls.some(
    (call) =>
      LIVE_CALL_STATUSES.includes(call.status as (typeof LIVE_CALL_STATUSES)[number]) &&
      !isStaleLiveCall(call.status, call.updatedAt, now),
  );
  return live ? "You already have a live call. Hang it up before dialing another number." : null;
}
