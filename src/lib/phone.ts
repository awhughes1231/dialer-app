import { parsePhoneNumberFromString } from "libphonenumber-js";

const NANP = /^\+1([2-9]\d{2})([2-9]\d{6})$/;

export function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

/** Normalize a human-entered or Twenty phone value to E.164, or return null. */
export function toE164(input: string | null | undefined, defaultCountry: "US" = "US"): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (parsed?.isValid()) return parsed.number;

  const digits = digitsOnly(trimmed);
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (trimmed.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function isNanpE164(e164: string): boolean {
  return NANP.test(e164);
}

export function areaCodeOf(e164: string): string | null {
  const match = NANP.exec(e164);
  return match ? match[1] : null;
}

export function formatPhone(e164: string): string {
  const match = NANP.exec(e164);
  if (!match) return e164;
  const area = match[1];
  const rest = match[2];
  return `+1 (${area}) ${rest.slice(0, 3)}-${rest.slice(3)}`;
}

export function phonesFromTwentyComposite(phones: unknown): { all: string[]; primary: string | null } {
  if (!phones || typeof phones !== "object") return { all: [], primary: null };
  const record = phones as {
    primaryPhoneNumber?: string | null;
    primaryPhoneCountryCode?: string | null;
    additionalPhones?: unknown;
  };
  const country = record.primaryPhoneCountryCode?.toUpperCase() === "US" ? "US" : "US";
  const raw: string[] = [];
  if (typeof record.primaryPhoneNumber === "string") raw.push(record.primaryPhoneNumber);
  if (Array.isArray(record.additionalPhones)) {
    for (const entry of record.additionalPhones) {
      if (typeof entry === "string") raw.push(entry);
      else if (entry && typeof entry === "object" && "number" in entry && typeof entry.number === "string") {
        raw.push(entry.number);
      }
    }
  }
  const all: string[] = [];
  for (const value of raw) {
    const e164 = toE164(value, country);
    if (e164 && !all.includes(e164)) all.push(e164);
  }
  const primary = typeof record.primaryPhoneNumber === "string" ? toE164(record.primaryPhoneNumber, country) : null;
  return { all, primary: primary && all.includes(primary) ? primary : all[0] ?? null };
}
