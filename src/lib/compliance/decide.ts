import { selectCallerId, type CallerIdRecord } from "@/lib/caller-id/select";
import { dncMatch, type DncEntryLike } from "@/lib/compliance/dnc";
import { resolveGeography, stateName, zonesForState } from "@/lib/compliance/geography";
import {
  DEFAULT_WINDOW_END_MINUTES,
  DEFAULT_WINDOW_START_MINUTES,
  evaluateCallingWindow,
  formatClock,
} from "@/lib/compliance/hours";
import { decideRecording, type RecordingSettings } from "@/lib/compliance/recording";
import { formatPhone, toE164 } from "@/lib/phone";

export type TwentyDncStatus = "clear" | "flagged" | "unknown" | "field_missing" | "not_applicable";

export type PartyInput = {
  id: string;
  name: string;
  phones: string[];
  primaryPhone: string | null;
  state: string | null;
  dnc: TwentyDncStatus;
};

export type DialSettings = RecordingSettings & {
  unknownTimezone: "block" | "allow";
  allowDemoNumbers: boolean;
  defaultCallerId?: string | null;
  windowStartMinutes: number;
  windowEndMinutes: number;
};

export type PhoneChoice = {
  e164: string | null;
  blocks: string[];
  warnings: string[];
};

export function choosePhone(input: {
  requestedPhone?: string | null;
  person?: PartyInput | null;
  company?: PartyInput | null;
}): PhoneChoice {
  const blocks: string[] = [];
  const warnings: string[] = [];
  const requested = input.requestedPhone?.trim() ? toE164(input.requestedPhone) : null;
  if (input.requestedPhone?.trim() && !requested) {
    blocks.push("That is not a valid phone number.");
    return { e164: null, blocks, warnings };
  }

  const saved = new Set([
    ...(input.person?.phones ?? []),
    ...(input.company?.phones ?? []),
  ]);

  if (requested) {
    if (saved.size > 0 && !saved.has(requested)) {
      warnings.push("This number is not saved on the Twenty record. It will still be dialed.");
    }
    return { e164: requested, blocks, warnings };
  }

  const fromPerson = input.person?.primaryPhone ?? input.person?.phones[0] ?? null;
  if (fromPerson) return { e164: fromPerson, blocks, warnings };
  const fromCompany = input.company?.primaryPhone ?? input.company?.phones[0] ?? null;
  if (fromCompany) return { e164: fromCompany, blocks, warnings };

  if (input.person) blocks.push("This person has no phone number in Twenty.");
  else if (input.company) blocks.push("This company has no phone number in Twenty.");
  else blocks.push("Enter a phone number or open a Twenty record that has one.");
  return { e164: null, blocks, warnings };
}

export type DialDecision = {
  allowed: boolean;
  blocks: string[];
  warnings: string[];
  e164: string | null;
  prospectState: string | null;
  areaCode: string | null;
  timeZones: string[];
  timezoneSource: "area_code" | "state" | "toll_free_state" | "unknown" | null;
  localTimeLabel: string | null;
  callerId: {
    e164: string;
    reason: string;
    state: string | null;
    areaCode: string | null;
    demo: boolean;
  } | null;
  recording: ReturnType<typeof decideRecording>;
  complianceSummary: string;
};

export function refusal(message: string, settings: DialSettings = defaultDialSettings()): DialDecision {
  return {
    allowed: false,
    blocks: [message],
    warnings: [],
    e164: null,
    prospectState: null,
    areaCode: null,
    timeZones: [],
    timezoneSource: null,
    localTimeLabel: null,
    callerId: null,
    recording: decideRecording(null, settings),
    complianceSummary: message,
  };
}

export function defaultDialSettings(overrides: Partial<DialSettings> = {}): DialSettings {
  return {
    allPartyStates: overrides.allPartyStates ?? new Set(["CA", "CT", "FL", "IL", "MD", "MA", "MI", "MT", "NV", "NH", "OR", "PA", "WA"]),
    twoPartyMode: overrides.twoPartyMode ?? "announce",
    announceInOneParty: overrides.announceInOneParty ?? true,
    unknownTimezone: overrides.unknownTimezone ?? "block",
    allowDemoNumbers: overrides.allowDemoNumbers ?? true,
    defaultCallerId: overrides.defaultCallerId ?? null,
    windowStartMinutes: overrides.windowStartMinutes ?? DEFAULT_WINDOW_START_MINUTES,
    windowEndMinutes: overrides.windowEndMinutes ?? DEFAULT_WINDOW_END_MINUTES,
  };
}

function stateHint(person?: PartyInput | null, company?: PartyInput | null): string | null {
  return person?.state ?? company?.state ?? null;
}

export function decideDial(input: {
  now: Date;
  requestedPhone?: string | null;
  person?: PartyInput | null;
  company?: PartyInput | null;
  dncEntries: DncEntryLike[];
  pool: CallerIdRecord[];
  settings: DialSettings;
  linkedToTwenty: boolean;
}): DialDecision {
  const settings = input.settings;
  const phone = choosePhone(input);
  const blocks = [...phone.blocks];
  const warnings = [...phone.warnings];

  const emptyRecording = decideRecording(null, settings);

  if (!phone.e164) {
    return {
      allowed: false,
      blocks,
      warnings,
      e164: null,
      prospectState: null,
      areaCode: null,
      timeZones: [],
      timezoneSource: null,
      localTimeLabel: null,
      callerId: null,
      recording: emptyRecording,
      complianceSummary: blocks.join(" "),
    };
  }

  const hint = stateHint(input.person, input.company);
  const geo = resolveGeography(phone.e164, hint);
  let prospectState: string | null = null;
  let areaCode: string | null = null;
  let timeZones: string[] = [];
  let timezoneSource: DialDecision["timezoneSource"] = "unknown";

  if (geo.kind === "invalid") {
    blocks.push("That is not a valid US phone number.");
  } else if (geo.kind === "international") {
    blocks.push("Phase 1 only places calls to US numbers (+1).");
  } else if (geo.kind === "non_us") {
    areaCode = geo.areaCode;
    blocks.push(
      geo.region === "canada"
        ? "This is a Canadian number. Phase 1 only dials US prospects."
        : "This is a Caribbean number outside the US. Phase 1 only dials US prospects.",
    );
  } else if (geo.kind === "unknown_area") {
    areaCode = geo.areaCode;
    const fallback = hint ? zonesForState(hint) : [];
    if (fallback.length > 0 && hint) {
      prospectState = hint;
      timeZones = fallback;
      timezoneSource = "state";
      warnings.push(
        `Area code ${geo.areaCode} is not in the local map. The calling window uses ${stateName(hint)} time from the Twenty address.`,
      );
    } else if (settings.unknownTimezone === "allow") {
      timezoneSource = "unknown";
      warnings.push("The prospect's time zone could not be determined, and COMPLIANCE_UNKNOWN_TZ=allow, so the calling window was not enforced.");
    } else {
      blocks.push(
        `Cannot determine the prospect's time zone from area code ${geo.areaCode} or a state on the Twenty record. Add a US state on the person or company, or use a known US area code.`,
      );
    }
  } else if (geo.kind === "toll_free") {
    areaCode = geo.areaCode;
    if (geo.zones.length > 0 && geo.state) {
      prospectState = geo.state;
      timeZones = geo.zones;
      timezoneSource = "toll_free_state";
      warnings.push(
        `Toll-free numbers have no local time zone of their own. The window uses ${stateName(geo.state)} from the Twenty address${geo.zones.length > 1 ? ", and only the overlap of that state's time zones" : ""}.`,
      );
    } else if (settings.unknownTimezone === "allow") {
      warnings.push("This toll-free number has no state on the Twenty record, and COMPLIANCE_UNKNOWN_TZ=allow, so the calling window was not enforced.");
    } else {
      blocks.push(
        "Toll-free numbers don't have a local time zone. Add a US state on the Twenty person or company before dialing.",
      );
    }
  } else {
    areaCode = geo.areaCode;
    prospectState = geo.state;
    timeZones = geo.zones;
    timezoneSource = "area_code";
    if (hint && hint !== geo.state) {
      warnings.push(
        `Area code ${geo.areaCode} is ${stateName(geo.state)}. The Twenty address says ${stateName(hint)}. The calling window and caller ID use the area code.`,
      );
    }
  }

  const internal = dncMatch(input.dncEntries, phone.e164);
  if (internal) {
    blocks.push(`Do not call: this number is on the internal DNC list (${internal.reason}).`);
  }

  const personDnc = input.person?.dnc ?? "not_applicable";
  const companyDnc = input.company?.dnc ?? "not_applicable";
  if (personDnc === "flagged") {
    blocks.push("Do not call: this person is marked do-not-call in Twenty.");
  } else if (personDnc === "unknown") {
    blocks.push("Could not verify this person's do-not-call field in Twenty. Dialing is paused until the CRM responds.");
  } else if (personDnc === "field_missing") {
    warnings.push("Twenty has no do-not-call field on people yet. Run the setup script. The internal DNC list was still checked.");
  }
  if (companyDnc === "flagged") {
    blocks.push("Do not call: this company is marked do-not-call in Twenty.");
  } else if (companyDnc === "unknown") {
    blocks.push("Could not verify this company's do-not-call field in Twenty. Dialing is paused until the CRM responds.");
  } else if (companyDnc === "field_missing") {
    warnings.push("Twenty has no do-not-call field on companies yet. Run the setup script. The internal DNC list was still checked.");
  }

  if (!input.linkedToTwenty) {
    warnings.push("This number is not linked to a Twenty record, so only the internal DNC list was checked.");
  }

  let localTimeLabel: string | null = null;
  if (timeZones.length > 0 && !blocks.some((block) => block.startsWith("Phase 1 only") || block.startsWith("This is a Canadian") || block.startsWith("This is a Caribbean"))) {
    const window = evaluateCallingWindow(input.now, timeZones, settings.windowStartMinutes, settings.windowEndMinutes);
    localTimeLabel = window.zones.map((zone) => zone.label).join(" · ");
    if (timeZones.length > 1) {
      warnings.push(
        `This number spans more than one time zone (${timeZones.join(", ")}). Calls are allowed only during the overlap: ${formatClock(settings.windowStartMinutes)} in the westernmost zone through ${formatClock(settings.windowEndMinutes)} in the easternmost zone.`,
      );
    }
    if (!window.open) {
      const closed = window.zones.filter((zone) => !zone.open).map((zone) => `${zone.label} (${zone.timeZone})`);
      blocks.push(
        `Outside calling hours. Local time is ${closed.join("; ")}. Calls are allowed from ${formatClock(settings.windowStartMinutes)} to ${formatClock(settings.windowEndMinutes)} in the prospect's time zone.`,
      );
    }
  }

  const recording = decideRecording(blocks.some((b) => b.includes("Canadian") || b.includes("Caribbean") || b.includes("only places calls")) ? null : prospectState, settings);
  if (recording.mode === "skip" && !blocks.some((b) => b.startsWith("Phase 1") || b.includes("Canadian") || b.includes("Caribbean"))) {
    warnings.push(recording.reason);
  }

  const callerId =
    phone.e164 && geo.kind !== "international" && geo.kind !== "non_us" && geo.kind !== "invalid"
      ? selectCallerId({
          pool: input.pool,
          prospectAreaCode: areaCode,
          prospectState,
          allowDemoNumbers: settings.allowDemoNumbers,
          defaultCallerId: settings.defaultCallerId,
        })
      : null;

  if (!callerId && !blocks.some((b) => b.startsWith("Phase 1") || b.includes("Canadian") || b.includes("Caribbean") || b.startsWith("That is not"))) {
    blocks.push("No caller ID number is available. Add US numbers to the pool before dialing.");
  } else if (callerId?.demo) {
    warnings.push("This caller ID is demo data and is not a real Telnyx number. Turn off SEED_DEMO_DATA and add purchased numbers before going live.");
  }

  const summaryParts = [
    `Number ${formatPhone(phone.e164)}.`,
    prospectState ? `State ${prospectState} (${stateName(prospectState)}).` : "State unknown.",
    areaCode ? `Area code ${areaCode}.` : null,
    localTimeLabel ? `Local time at dial: ${localTimeLabel}.` : null,
    `Calling window ${formatClock(settings.windowStartMinutes)}–${formatClock(settings.windowEndMinutes)}.`,
    callerId ? `Caller ID ${formatPhone(callerId.e164)} (${callerId.reason}).` : "No caller ID selected.",
    recording.reason,
    internal ? `Internal DNC: ${internal.reason}.` : "Not on the internal DNC list.",
    blocks.length ? `Blocked: ${blocks.join(" ")}` : "Allowed.",
  ].filter(Boolean);

  return {
    allowed: blocks.length === 0,
    blocks,
    warnings,
    e164: phone.e164,
    prospectState,
    areaCode,
    timeZones,
    timezoneSource,
    localTimeLabel,
    callerId,
    recording,
    complianceSummary: summaryParts.join(" "),
  };
}
