import { areaCodeOf, toE164 } from "@/lib/phone";

export type CallerIdRecord = {
  e164: string;
  areaCode?: string | null;
  state?: string | null;
  isDefault?: boolean;
  active?: boolean;
  demo?: boolean;
  label?: string | null;
};

export type CallerIdChoice = {
  e164: string;
  reason: string;
  state: string | null;
  areaCode: string | null;
  demo: boolean;
};

export type CallerIdPoolInput = {
  e164: string;
  state?: string | null;
  areaCode?: string | null;
  isDefault?: boolean;
  label?: string | null;
};

export function parseCallerIdEnv(value: string | undefined | null): {
  numbers: CallerIdPoolInput[];
  errors: string[];
} {
  if (!value || !value.trim()) return { numbers: [], errors: [] };
  const numbers: CallerIdPoolInput[] = [];
  const errors: string[] = [];
  const tokens = value.split(",").map((token) => token.trim()).filter(Boolean);
  tokens.forEach((token, index) => {
    const [rawNumber, rawState, rawArea, rawFlag, ...labelParts] = token.split(":");
    const e164 = toE164(rawNumber ?? "");
    if (!e164) {
      errors.push(`Caller ID #${index + 1} is not a valid phone number (${rawNumber})`);
      return;
    }
    const state = rawState?.trim().toUpperCase() || null;
    if (state && !/^[A-Z]{2}$/.test(state)) {
      errors.push(`Caller ID ${e164} has an invalid state "${rawState}"`);
      return;
    }
    const areaCode = rawArea?.trim() || areaCodeOf(e164);
    const flag = (rawFlag ?? "").trim().toLowerCase();
    if (flag && flag !== "default") {
      errors.push(`Caller ID ${e164} has unknown flag "${flag}". Use "default" or leave it blank.`);
      return;
    }
    numbers.push({
      e164,
      state,
      areaCode,
      isDefault: flag === "default",
      label: labelParts.join(":").trim() || null,
    });
  });
  return { numbers, errors };
}

function usable(pool: CallerIdRecord[], allowDemoNumbers: boolean): CallerIdRecord[] {
  return pool.filter((number) => number.active !== false && (allowDemoNumbers || !number.demo));
}

export function selectCallerId(input: {
  pool: CallerIdRecord[];
  prospectAreaCode: string | null;
  prospectState: string | null;
  allowDemoNumbers: boolean;
  defaultCallerId?: string | null;
}): CallerIdChoice | null {
  const pool = usable(input.pool, input.allowDemoNumbers).slice().sort((a, b) => a.e164.localeCompare(b.e164));

  const describe = (number: CallerIdRecord, reason: string): CallerIdChoice => ({
    e164: number.e164,
    reason,
    state: number.state ?? null,
    areaCode: number.areaCode ?? areaCodeOf(number.e164),
    demo: Boolean(number.demo),
  });

  if (input.prospectAreaCode) {
    const areaMatch = pool.find((number) => (number.areaCode ?? areaCodeOf(number.e164)) === input.prospectAreaCode);
    if (areaMatch) {
      return describe(areaMatch, `Same area code (${input.prospectAreaCode})`);
    }
  }

  if (input.prospectState) {
    const stateMatch = pool.find((number) => number.state === input.prospectState);
    if (stateMatch) {
      const areaNote = input.prospectAreaCode
        ? `no ${input.prospectAreaCode} number is in the pool`
        : "the prospect's area code is not known";
      return describe(stateMatch, `Same state (${input.prospectState}); ${areaNote}`);
    }
  }

  const preferred = pool.find((number) => number.isDefault) ?? pool[0];
  if (preferred) {
    if (preferred.isDefault) {
      const where = input.prospectState
        ? `the pool has no ${input.prospectState} number`
        : "the prospect's state is not known";
      return describe(preferred, `Default number; ${where}`);
    }
    return describe(preferred, "Only active number in the pool");
  }

  const fallback = input.defaultCallerId ? toE164(input.defaultCallerId) : null;
  if (fallback) {
    return {
      e164: fallback,
      reason: "TELNYX_DEFAULT_CALLER_ID; the pool has no active number",
      state: null,
      areaCode: areaCodeOf(fallback),
      demo: false,
    };
  }
  return null;
}
