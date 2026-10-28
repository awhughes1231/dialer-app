import { areaCodeOf, isNanpE164 } from "@/lib/phone";

/**
 * US area-code map used for calling hours and local-presence caller ID.
 *
 * Time zones are IANA names. Where one area code covers two zones, `zones`
 * lists both and the dialer allows a call only during the overlap
 * (8:00 in the western zone through 21:00 in the eastern zone).
 *
 * Codes are included only when the state assignment is confident. An unknown
 * overlay falls through to the Twenty address state, or is blocked if the
 * state is missing. That is safer than guessing a state.
 */

export type AreaInfo = {
  state: string;
  zones: string[];
};

const AREA_CODES: Record<string, AreaInfo> = {};

function assign(state: string, zones: string[], codes: string[]) {
  for (const code of codes) {
    AREA_CODES[code] = { state, zones: [...zones] };
  }
}

const ET = ["America/New_York"];
const CT = ["America/Chicago"];
const MT = ["America/Denver"];
const AZ = ["America/Phoenix"];
const PT = ["America/Los_Angeles"];
const ET_IN = ["America/Indiana/Indianapolis"];
const ET_MI = ["America/Detroit"];

assign("AL", CT, ["205", "251", "256", "334", "659"]);
assign("AK", ["America/Anchorage"], ["907"]);
assign("AZ", AZ, ["480", "520", "602", "623", "928"]);
assign("AR", CT, ["327", "479", "501", "870"]);
assign("CA", PT, [
  "209", "213", "279", "310", "323", "341", "408", "415", "424", "442",
  "510", "530", "559", "562", "619", "626", "628", "650", "657", "661",
  "669", "707", "714", "747", "760", "805", "818", "820", "831", "858",
  "909", "916", "925", "949", "951",
]);
assign("CO", MT, ["303", "719", "720", "970"]);
assign("CT", ET, ["203", "475", "860", "959"]);
assign("DE", ET, ["302"]);
assign("DC", ET, ["202", "771"]);
assign("FL", ET, [
  "239", "305", "321", "352", "386", "407", "561", "656", "689", "727",
  "754", "772", "786", "813", "863", "904", "941", "954",
]);
assign("FL", CT, ["448", "850"]);
assign("GA", ET, ["229", "404", "470", "478", "678", "706", "762", "770", "912"]);
assign("HI", ["Pacific/Honolulu"], ["808"]);
assign("ID", ["America/Boise", "America/Los_Angeles"], ["208", "986"]);
assign("IL", CT, [
  "217", "224", "309", "312", "331", "464", "618", "630", "708", "730",
  "773", "779", "815", "847", "872",
]);
assign("IN", CT, ["219"]);
assign("IN", ET_IN, ["260", "317", "463", "574", "765"]);
assign("IN", [...ET_IN, ...CT], ["812", "930"]);
assign("IA", CT, ["319", "515", "563", "641", "712"]);
assign("KS", CT, ["316", "620", "785", "913"]);
assign("KY", ET, ["502", "606", "859"]);
assign("KY", CT, ["270", "364"]);
assign("LA", CT, ["225", "318", "337", "504", "985"]);
assign("ME", ET, ["207"]);
assign("MD", ET, ["240", "301", "410", "443", "667"]);
assign("MA", ET, ["339", "351", "413", "508", "617", "774", "781", "857", "978"]);
assign("MI", ET_MI, ["231", "248", "269", "313", "517", "586", "616", "734", "810", "947", "989"]);
assign("MI", [...ET_MI, ...CT], ["906"]);
assign("MN", CT, ["218", "320", "507", "612", "651", "763", "952"]);
assign("MS", CT, ["228", "601", "662", "769"]);
assign("MO", CT, ["314", "417", "573", "636", "660", "816"]);
assign("MT", MT, ["406"]);
assign("NE", CT, ["402", "531"]);
assign("NE", [...CT, ...MT], ["308"]);
assign("NV", PT, ["702", "725", "775"]);
assign("NH", ET, ["603"]);
assign("NJ", ET, ["201", "551", "609", "732", "848", "856", "862", "908", "973"]);
assign("NM", MT, ["505", "575"]);
assign("NY", ET, [
  "212", "315", "332", "347", "516", "518", "585", "607", "631", "646",
  "716", "718", "845", "914", "917", "929", "934",
]);
assign("NC", ET, ["252", "336", "704", "743", "828", "910", "919", "980", "984"]);
assign("ND", CT, ["701"]);
assign("OH", ET, ["216", "220", "234", "330", "380", "419", "440", "513", "567", "614", "740", "937"]);
assign("OK", CT, ["405", "539", "580", "918"]);
assign("OR", PT, ["503", "971"]);
assign("OR", ["America/Los_Angeles", "America/Boise"], ["458", "541"]);
assign("PA", ET, ["215", "223", "267", "272", "412", "484", "570", "610", "717", "724", "814", "878"]);
assign("RI", ET, ["401"]);
assign("SC", ET, ["803", "843", "854", "864"]);
assign("SD", [...CT, ...MT], ["605"]);
assign("TN", ET, ["423", "615", "629", "865", "931"]);
assign("TN", CT, ["731", "901"]);
assign("TX", CT, [
  "210", "214", "254", "281", "325", "346", "361", "409", "430", "432",
  "469", "512", "682", "713", "726", "737", "806", "817", "830", "832",
  "903", "936", "940", "956", "972", "979",
]);
assign("TX", MT, ["915"]);
assign("UT", MT, ["385", "435", "801"]);
assign("VT", ET, ["802"]);
assign("VA", ET, ["276", "434", "540", "571", "703", "757", "804"]);
assign("WA", PT, ["206", "253", "360", "425", "509", "564"]);
assign("WV", ET, ["304", "681"]);
assign("WI", CT, ["262", "414", "534", "608", "715", "920"]);
assign("WY", MT, ["307"]);

assign("PR", ["America/Puerto_Rico"], ["787", "939"]);
assign("VI", ["America/St_Thomas"], ["340"]);
assign("GU", ["Pacific/Guam"], ["671"]);
assign("AS", ["Pacific/Pago_Pago"], ["684"]);
assign("MP", ["Pacific/Saipan"], ["670"]);

export const TOLL_FREE_AREA_CODES = new Set(["800", "833", "844", "855", "866", "877", "888"]);

export const CANADA_AREA_CODES = new Set([
  "204", "226", "236", "249", "250", "289", "306", "343", "365", "367",
  "403", "416", "418", "431", "437", "438", "450", "506", "514", "519",
  "548", "579", "581", "587", "604", "613", "639", "647", "672", "705",
  "709", "778", "780", "782", "807", "819", "825", "867", "873", "902", "905",
]);

export const CARIBBEAN_NON_US_AREA_CODES = new Set([
  "242", "246", "264", "268", "284", "345", "441", "473", "649", "658",
  "664", "721", "758", "767", "784", "809", "829", "849", "868", "869", "876",
]);

/** Zones used when Twenty has a state but the area code does not pin a zone. */
export const STATE_TIME_ZONES: Record<string, string[]> = {
  AL: CT,
  AK: ["America/Anchorage"],
  AZ: AZ,
  AR: CT,
  CA: PT,
  CO: MT,
  CT: ET,
  DE: ET,
  DC: ET,
  FL: [...ET, ...CT],
  GA: ET,
  HI: ["Pacific/Honolulu"],
  ID: ["America/Boise", "America/Los_Angeles"],
  IL: CT,
  IN: [...ET_IN, ...CT],
  IA: CT,
  KS: [...CT, ...MT],
  KY: [...ET, ...CT],
  LA: CT,
  ME: ET,
  MD: ET,
  MA: ET,
  MI: [...ET_MI, ...CT],
  MN: CT,
  MS: CT,
  MO: CT,
  MT: MT,
  NE: [...CT, ...MT],
  NV: PT,
  NH: ET,
  NJ: ET,
  NM: MT,
  NY: ET,
  NC: ET,
  ND: [...CT, ...MT],
  OH: ET,
  OK: CT,
  OR: ["America/Los_Angeles", "America/Boise"],
  PA: ET,
  RI: ET,
  SC: ET,
  SD: [...CT, ...MT],
  TN: [...ET, ...CT],
  TX: [...CT, ...MT],
  UT: MT,
  VT: ET,
  VA: ET,
  WA: PT,
  WV: ET,
  WI: CT,
  WY: MT,
  PR: ["America/Puerto_Rico"],
  VI: ["America/St_Thomas"],
  GU: ["Pacific/Guam"],
  AS: ["Pacific/Pago_Pago"],
  MP: ["Pacific/Saipan"],
};

const STATE_NAMES: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  "washington dc": "DC",
  "washington d c": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "puerto rico": "PR",
  "us virgin islands": "VI",
  "u s virgin islands": "VI",
  "virgin islands": "VI",
  guam: "GU",
  "american samoa": "AS",
  "northern mariana islands": "MP",
};

const STATE_LABELS: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "Washington, DC",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  PR: "Puerto Rico",
  VI: "US Virgin Islands",
  GU: "Guam",
  AS: "American Samoa",
  MP: "Northern Mariana Islands",
};

export function areaCodeDirectory(): Record<string, AreaInfo> {
  return AREA_CODES;
}

export function stateName(code: string | null | undefined): string {
  if (!code) return "Unknown";
  return STATE_LABELS[code] ?? code;
}

export function normalizeState(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const compact = trimmed.toUpperCase().replace(/\./g, "").replace(/\s+/g, " ");
  if (/^[A-Z]{2}$/.test(compact) && STATE_TIME_ZONES[compact]) return compact;
  const key = trimmed.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  return STATE_NAMES[key] ?? null;
}

export type GeographyResolution =
  | { kind: "invalid" }
  | { kind: "international" }
  | { kind: "non_us"; region: "canada" | "caribbean"; areaCode: string }
  | { kind: "unknown_area"; areaCode: string }
  | {
      kind: "toll_free";
      areaCode: string;
      state: string | null;
      zones: string[];
    }
  | {
      kind: "us";
      areaCode: string;
      state: string;
      zones: string[];
    };

export function resolveGeography(e164: string | null, stateHint: string | null | undefined): GeographyResolution {
  if (!e164) return { kind: "invalid" };
  if (!e164.startsWith("+1")) return { kind: "international" };
  if (!isNanpE164(e164)) return { kind: "invalid" };
  const areaCode = areaCodeOf(e164);
  if (!areaCode) return { kind: "invalid" };

  if (CANADA_AREA_CODES.has(areaCode)) return { kind: "non_us", region: "canada", areaCode };
  if (CARIBBEAN_NON_US_AREA_CODES.has(areaCode)) return { kind: "non_us", region: "caribbean", areaCode };

  const hint = normalizeState(stateHint);

  if (TOLL_FREE_AREA_CODES.has(areaCode)) {
    const zones = hint ? STATE_TIME_ZONES[hint] ?? [] : [];
    return { kind: "toll_free", areaCode, state: hint, zones };
  }

  const known = AREA_CODES[areaCode];
  if (!known) return { kind: "unknown_area", areaCode };
  return { kind: "us", areaCode, state: known.state, zones: known.zones };
}

export function zonesForState(state: string | null | undefined): string[] {
  if (!state) return [];
  return STATE_TIME_ZONES[state] ?? [];
}
