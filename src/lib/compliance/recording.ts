/**
 * All-party (two-party) consent jurisdictions for telephone recording.
 *
 * The user's list was CA, FL, IL, MD, MA, MT, NH, PA, and WA.
 * These four are included as well, because their telephone statutes require
 * all-party consent:
 * - Connecticut (Conn. Gen. Stat. § 52-570d)
 * - Michigan (Mich. Comp. Laws § 750.539c)
 * - Nevada wire communications (Nev. Rev. Stat. § 200.620)
 * - Oregon electronic communications (Or. Rev. Stat. § 165.540)
 *
 * Vermont is intentionally omitted: its rule is a civil privacy claim, not
 * the same all-party criminal statute. Add VT through ALL_PARTY_STATES if
 * counsel wants it treated the same way.
 *
 * This is an engineering control, not a legal opinion.
 */
export const DEFAULT_ALL_PARTY_STATES = [
  "CA",
  "CT",
  "FL",
  "IL",
  "MD",
  "MA",
  "MI",
  "MT",
  "NV",
  "NH",
  "OR",
  "PA",
  "WA",
] as const;

export const DISCLOSURE_TEXT =
  "This call may be recorded for quality and training purposes.";

export type RecordingMode = "record_with_disclosure" | "record" | "skip";

export type RecordingSettings = {
  allPartyStates: ReadonlySet<string>;
  twoPartyMode: "announce" | "skip";
  announceInOneParty: boolean;
};

export type RecordingDecision = {
  mode: RecordingMode;
  disclosureRequired: boolean;
  twoParty: boolean;
  reason: string;
  disclosureText: string;
};

export function parseAllPartyStates(override: string | undefined | null): Set<string> {
  if (!override || !override.trim()) return new Set(DEFAULT_ALL_PARTY_STATES);
  const states = override
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  if (states.some((state) => !/^[A-Z]{2}$/.test(state))) {
    throw new Error("ALL_PARTY_STATES must be a comma-separated list of 2-letter codes");
  }
  return new Set(states);
}

export function decideRecording(
  state: string | null,
  settings: RecordingSettings,
): RecordingDecision {
  const twoParty = state ? settings.allPartyStates.has(state) : true;
  const disclosureText = DISCLOSURE_TEXT;

  if (twoParty && settings.twoPartyMode === "skip") {
    return {
      mode: "skip",
      disclosureRequired: false,
      twoParty,
      disclosureText,
      reason: state
        ? `Recording is off because ${state} requires all-party consent and RECORDING_TWO_PARTY_MODE=skip.`
        : "Recording is off because the prospect's state is unknown and unknown states are treated as all-party consent.",
    };
  }

  const disclosureRequired = twoParty || settings.announceInOneParty;
  if (disclosureRequired) {
    return {
      mode: "record_with_disclosure",
      disclosureRequired: true,
      twoParty,
      disclosureText,
      reason: twoParty
        ? state
          ? `${state} is an all-party consent state. The dialer speaks a recording notice to both parties and records the call, including the notice.`
          : "The prospect's state is unknown, so the dialer treats the call as all-party consent, speaks a recording notice, and records it."
        : "This state is one-party consent. A recording notice is still played because RECORDING_ANNOUNCE_IN_ONE_PARTY is on.",
    };
  }

  return {
    mode: "record",
    disclosureRequired: false,
    twoParty: false,
    disclosureText,
    reason: state
      ? `${state} is one-party consent and the recording notice is off for one-party states. The call is recorded.`
      : "The call is recorded without a spoken notice.",
  };
}
