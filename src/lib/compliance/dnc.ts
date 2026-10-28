import { toE164 } from "@/lib/phone";

export type DncEntryLike = {
  e164: string;
  reason: string;
};

export function dncMatch(entries: DncEntryLike[], phone: string | null): DncEntryLike | null {
  if (!phone) return null;
  const target = toE164(phone) ?? phone;
  return entries.find((entry) => (toE164(entry.e164) ?? entry.e164) === target) ?? null;
}
