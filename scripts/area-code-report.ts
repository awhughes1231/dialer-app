import { countAreaCodes } from "../src/lib/reports/area-codes";
import { phonesFromTwentyComposite } from "../src/lib/phone";
import { readRecordList, twentyRoot } from "../src/lib/twenty/map";

const apiKey = process.env.TWENTY_API_KEY?.trim() ?? "";
const root = twentyRoot(process.env.TWENTY_API_URL?.trim() || "https://crm.ecommercewala.co");
const pageLimit = Number(process.argv.find((arg) => arg.startsWith("--pages="))?.split("=")[1] ?? 20);

if (!apiKey) {
  console.error("Set TWENTY_API_KEY. This report only reads people. It does not write to Twenty.");
  process.exit(1);
}

async function main() {
  const phones: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < pageLimit; page += 1) {
    const params = new URLSearchParams({ limit: "60", depth: "0", fields: "id,phones" });
    if (cursor) params.set("starting_after", cursor);
    const response = await fetch(`${root}/rest/people?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Twenty ${response.status} while reading people`);
    const json = await response.json();
    for (const person of readRecordList(json, "people")) {
      phones.push(...phonesFromTwentyComposite((person as { phones?: unknown }).phones).all);
    }
    const pageInfo = json.pageInfo ?? json.data?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    cursor = pageInfo.endCursor;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  const counts = countAreaCodes(phones);
  console.log("areaCode,state,label,count");
  for (const row of counts.slice(0, 40)) {
    console.log(`${row.areaCode},${row.state ?? ""},${row.stateLabel},${row.count}`);
  }
  console.log(`\nCounted ${phones.length} phone numbers. Buy local-presence numbers for the top area codes first.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
