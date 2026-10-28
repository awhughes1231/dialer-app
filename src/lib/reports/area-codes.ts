import { areaCodeDirectory, stateName } from "@/lib/compliance/geography";
import { areaCodeOf, toE164 } from "@/lib/phone";

export type AreaCodeCount = {
  areaCode: string;
  state: string | null;
  stateLabel: string;
  count: number;
};

export function countAreaCodes(phones: string[]): AreaCodeCount[] {
  const counts = new Map<string, number>();
  for (const phone of phones) {
    const e164 = toE164(phone) ?? phone;
    const areaCode = areaCodeOf(e164);
    if (!areaCode) continue;
    counts.set(areaCode, (counts.get(areaCode) ?? 0) + 1);
  }
  const directory = areaCodeDirectory();
  return [...counts.entries()]
    .map(([areaCode, count]) => {
      const state = directory[areaCode]?.state ?? null;
      return { areaCode, state, stateLabel: state ? stateName(state) : "Unknown", count };
    })
    .sort((a, b) => b.count - a.count || a.areaCode.localeCompare(b.areaCode));
}
