import { describe, expect, it } from "vitest";
import { parseCallerIdEnv, selectCallerId } from "@/lib/caller-id/select";
import { decideDial, defaultDialSettings } from "@/lib/compliance/decide";
import { dncMatch } from "@/lib/compliance/dnc";
import { areaCodeDirectory, CANADA_AREA_CODES, resolveGeography } from "@/lib/compliance/geography";
import { evaluateCallingWindow } from "@/lib/compliance/hours";
import { decideRecording, DEFAULT_ALL_PARTY_STATES, parseAllPartyStates } from "@/lib/compliance/recording";
import { isStaleLiveCall, liveCallBlock } from "@/lib/dispositions";
import { toE164 } from "@/lib/phone";
import type { PartyInput } from "@/lib/compliance/decide";

const pool = [
  { e164: "+14155551000", areaCode: "415", state: "CA", isDefault: true, active: true, demo: false },
  { e164: "+12125551000", areaCode: "212", state: "NY", isDefault: false, active: true, demo: false },
  { e164: "+13055551000", areaCode: "305", state: "FL", isDefault: false, active: true, demo: false },
  { e164: "+15125551999", areaCode: "512", state: "TX", isDefault: false, active: true, demo: true },
];

function person(overrides: Partial<PartyInput> = {}): PartyInput {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Jordan Lee",
    phones: ["+14155550100"],
    primaryPhone: "+14155550100",
    state: "CA",
    dnc: "clear",
    ...overrides,
  };
}

function dial(overrides: Partial<Parameters<typeof decideDial>[0]> = {}) {
  return decideDial({
    now: new Date("2026-01-15T18:00:00.000Z"),
    person: person(),
    dncEntries: [],
    pool,
    settings: defaultDialSettings(),
    linkedToTwenty: true,
    ...overrides,
  });
}

describe("calling hours", () => {
  it("blocks 7:59am and allows 8:00am through 8:59pm in the prospect's zone", () => {
    const at = (iso: string, phone: string, state: string) =>
      dial({
        now: new Date(iso),
        person: person({ phones: [phone], primaryPhone: phone, state }),
      });

    expect(at("2026-01-15T15:59:00.000Z", "+14155550100", "CA").allowed).toBe(false);
    expect(at("2026-01-15T15:59:00.000Z", "+14155550100", "CA").blocks.join(" ")).toMatch(/Outside calling hours/);
    expect(at("2026-01-15T16:00:00.000Z", "+14155550100", "CA").allowed).toBe(true);
    expect(at("2026-01-16T04:59:00.000Z", "+14155550100", "CA").allowed).toBe(true);
    expect(at("2026-01-16T05:00:00.000Z", "+14155550100", "CA").allowed).toBe(false);

    expect(at("2026-01-15T12:59:00.000Z", "+12125550198", "NY").allowed).toBe(false);
    expect(at("2026-01-15T13:00:00.000Z", "+12125550198", "NY").allowed).toBe(true);
    expect(at("2026-01-16T01:59:00.000Z", "+12125550198", "NY").allowed).toBe(true);
    expect(at("2026-01-16T02:00:00.000Z", "+12125550198", "NY").allowed).toBe(false);
  });

  it("uses the area-code zone rather than UTC or Eastern", () => {
    const morningOnTheEastCoastButStillNightInCalifornia = dial({
      now: new Date("2026-01-15T15:00:00.000Z"),
      person: person(),
    });
    expect(morningOnTheEastCoastButStillNightInCalifornia.allowed).toBe(false);
    expect(morningOnTheEastCoastButStillNightInCalifornia.timeZones).toEqual(["America/Los_Angeles"]);

    const eveningOnTheEastCoast = dial({
      now: new Date("2026-01-16T01:30:00.000Z"),
      person: person({ phones: ["+12125550198"], primaryPhone: "+12125550198", state: "NY" }),
    });
    expect(eveningOnTheEastCoast.allowed).toBe(true);
    expect(eveningOnTheEastCoast.prospectState).toBe("NY");
  });

  it("keeps Arizona on Phoenix time across daylight saving", () => {
    const blocked = dial({
      now: new Date("2026-07-15T14:59:00.000Z"),
      person: person({ phones: ["+16025550100"], primaryPhone: "+16025550100", state: "AZ" }),
    });
    const allowed = dial({
      now: new Date("2026-07-15T15:00:00.000Z"),
      person: person({ phones: ["+16025550100"], primaryPhone: "+16025550100", state: "AZ" }),
    });
    expect(blocked.allowed).toBe(false);
    expect(allowed.allowed).toBe(true);
    expect(allowed.timeZones).toEqual(["America/Phoenix"]);
    expect(evaluateCallingWindow(new Date("2026-01-15T15:00:00.000Z"), ["America/Phoenix"]).open).toBe(true);
  });

  it("allows a split area code only during the overlap", () => {
    const tooEarlyForCentral = dial({
      now: new Date("2026-01-15T13:30:00.000Z"),
      person: person({ phones: ["+18125550100"], primaryPhone: "+18125550100", state: "IN" }),
    });
    const bothOpen = dial({
      now: new Date("2026-01-15T14:00:00.000Z"),
      person: person({ phones: ["+18125550100"], primaryPhone: "+18125550100", state: "IN" }),
    });
    expect(tooEarlyForCentral.allowed).toBe(false);
    expect(tooEarlyForCentral.timeZones).toEqual(["America/Indiana/Indianapolis", "America/Chicago"]);
    expect(bothOpen.allowed).toBe(true);
    expect(bothOpen.warnings.join(" ")).toMatch(/overlap/);
  });
});

describe("do not call and geography", () => {
  it("blocks the internal list even when the number is formatted differently", () => {
    expect(dncMatch([{ e164: "(415) 555-0100", reason: "Asked on the last call" }], "+14155550100")?.reason).toMatch(/Asked/);
    const decision = dial({
      dncEntries: [{ e164: "4155550100", reason: "Asked on the last call" }],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blocks.join(" ")).toMatch(/internal DNC list/);
  });

  it("blocks a Twenty person or company flag and warns when the field is missing", () => {
    expect(dial({ person: person({ dnc: "flagged" }) }).blocks.join(" ")).toMatch(/person is marked do-not-call/);
    expect(
      dial({
        person: null,
        company: {
          id: "22222222-2222-4222-8222-222222222224",
          name: "Northwind",
          phones: ["+12065550177"],
          primaryPhone: "+12065550177",
          state: "WA",
          dnc: "flagged",
        },
        requestedPhone: "+12065550177",
      }).blocks.join(" "),
    ).toMatch(/company is marked do-not-call/);
    const missing = dial({ person: person({ dnc: "field_missing" }) });
    expect(missing.allowed).toBe(true);
    expect(missing.warnings.join(" ")).toMatch(/no do-not-call field/);
  });

  it("pauses when Twenty could not be checked", () => {
    expect(dial({ person: person({ dnc: "unknown" }) }).allowed).toBe(false);
  });

  it("rejects Canadian, Caribbean, and unknown US numbers", () => {
    expect(dial({ person: person({ phones: ["+14165550100"], primaryPhone: "+14165550100", state: null }) }).blocks.join(" ")).toMatch(/Canadian/);
    expect(dial({ person: person({ phones: ["+18765550100"], primaryPhone: "+18765550100", state: null }) }).blocks.join(" ")).toMatch(/Caribbean/);
    const unknown = dial({ person: person({ phones: ["+19995550199"], primaryPhone: "+19995550199", state: null }) });
    expect(unknown.allowed).toBe(false);
    expect(unknown.blocks.join(" ")).toMatch(/Cannot determine the prospect's time zone/);
    const tollFree = dial({
      person: null,
      requestedPhone: "+18005550199",
      linkedToTwenty: false,
    });
    expect(tollFree.blocks.join(" ")).toMatch(/Toll-free/);
  });

  it("uses the Twenty state for a toll-free number and prefers the area code when they disagree", () => {
    const tollFree = dial({
      person: person({ phones: ["+18005550123"], primaryPhone: "+18005550123", state: "NY" }),
      now: new Date("2026-01-15T15:00:00.000Z"),
    });
    expect(tollFree.allowed).toBe(true);
    expect(tollFree.timezoneSource).toBe("toll_free_state");

    const conflict = dial({
      person: person({ state: "NY" }),
      now: new Date("2026-01-15T16:30:00.000Z"),
    });
    expect(conflict.prospectState).toBe("CA");
    expect(conflict.warnings.join(" ")).toMatch(/Twenty address says New York/);
  });

  it("does not overlap US, Canadian, and toll-free codes", () => {
    const directory = areaCodeDirectory();
    for (const code of Object.keys(directory)) {
      expect(CANADA_AREA_CODES.has(code)).toBe(false);
    }
    expect(resolveGeography("+17875550100", null)).toMatchObject({ kind: "us", state: "PR" });
    expect(toE164("(415) 555-0100")).toBe("+14155550100");
  });
});

describe("recording consent", () => {
  it("includes the extra all-party states and stays configurable", () => {
    expect(DEFAULT_ALL_PARTY_STATES).toEqual(expect.arrayContaining(["CA", "FL", "IL", "MD", "MA", "MT", "NH", "PA", "WA", "CT", "MI", "NV", "OR"]));
    expect(parseAllPartyStates("CA,NY").has("FL")).toBe(false);
    for (const state of ["CT", "MI", "NV", "OR", "CA"]) {
      expect(decideRecording(state, defaultDialSettings()).twoParty).toBe(true);
    }
    expect(decideRecording("TX", defaultDialSettings()).twoParty).toBe(false);
  });

  it("announces and records by default, and can skip all-party states", () => {
    const announced = dial();
    expect(announced.recording.mode).toBe("record_with_disclosure");
    const skipped = dial({
      settings: defaultDialSettings({ twoPartyMode: "skip" }),
    });
    expect(skipped.allowed).toBe(true);
    expect(skipped.recording.mode).toBe("skip");
    expect(skipped.warnings.join(" ")).toMatch(/Recording is off/);

    const quietOneParty = dial({
      now: new Date("2026-01-15T18:00:00.000Z"),
      person: person({ phones: ["+15125550123"], primaryPhone: "+15125550123", state: "TX" }),
      settings: defaultDialSettings({ announceInOneParty: false }),
    });
    expect(quietOneParty.recording.mode).toBe("record");
    expect(quietOneParty.recording.disclosureRequired).toBe(false);
  });
});

describe("caller ID", () => {
  it("matches area code, then state, then default, and ignores demo numbers on Telnyx", () => {
    expect(selectCallerId({ pool, prospectAreaCode: "212", prospectState: "NY", allowDemoNumbers: true })?.e164).toBe("+12125551000");
    expect(selectCallerId({ pool, prospectAreaCode: "512", prospectState: "TX", allowDemoNumbers: false })?.reason).toMatch(/Default number/);
    expect(selectCallerId({ pool, prospectAreaCode: "512", prospectState: "TX", allowDemoNumbers: true })?.e164).toBe("+15125551999");
    const parsed = parseCallerIdEnv("+14155552671:CA:415:default:San Francisco,+12125552671:NY:212::New York");
    expect(parsed.errors).toEqual([]);
    expect(parsed.numbers[0].isDefault).toBe(true);
    expect(parseCallerIdEnv("+14155552671:California:415:default").errors.join(" ")).toMatch(/invalid state/);
  });

  it("blocks when the pool cannot supply a caller ID", () => {
    const decision = dial({ pool: [], settings: defaultDialSettings({ defaultCallerId: null }) });
    expect(decision.blocks.join(" ")).toMatch(/No caller ID/);
  });
});

describe("live calls", () => {
  it("blocks a second live call and ignores a stuck call after two hours", () => {
    const now = new Date("2026-10-28T16:00:00.000Z");
    expect(liveCallBlock([{ status: "IN_PROGRESS", updatedAt: new Date("2026-10-28T15:00:00.000Z") }], now)).toMatch(/live call/);
    expect(isStaleLiveCall("IN_PROGRESS", new Date("2026-10-28T13:00:00.000Z"), now)).toBe(true);
    expect(liveCallBlock([{ status: "IN_PROGRESS", updatedAt: new Date("2026-10-28T13:00:00.000Z") }], now)).toBeNull();
  });
});
