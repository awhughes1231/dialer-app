import { countAreaCodes } from "../src/lib/reports/area-codes";
import { phonesFromTwentyComposite } from "../src/lib/phone";
import { readRecordList, twentyRoot } from "../src/lib/twenty/map";
import { collectPages, DEFAULT_MAX_PAGES, PEOPLE_PAGE_SIZE } from "../src/lib/twenty/paging";

const apiKey = process.env.TWENTY_API_KEY?.trim() ?? "";
const root = twentyRoot(process.env.TWENTY_API_URL?.trim() || "https://crm.ecommercewala.co");
const pagesFlag = process.argv.find((arg) => arg.startsWith("--pages="));
const maxPages = pagesFlag ? Number(pagesFlag.split("=")[1]) : DEFAULT_MAX_PAGES;

if (!apiKey) {
  console.error("Set TWENTY_API_KEY. This report only reads people. It does not write to Twenty.");
  process.exit(1);
}
if (!Number.isFinite(maxPages) || maxPages < 1) {
  console.error("--pages must be a positive number");
  process.exit(1);
}

async function main() {
  console.log("Reading every person. Pausing between pages so this stays under Twenty's rate limit.");
  const people = await collectPages<unknown>({
    plural: "people",
    pageSize: PEOPLE_PAGE_SIZE,
    maxPages,
    pauseMs: 700,
    fetchPage: async (cursor) => {
      const params = new URLSearchParams({
        limit: String(PEOPLE_PAGE_SIZE),
        depth: "0",
        fields: "id,phones",
      });
      if (cursor) params.set("starting_after", cursor);
      const response = await fetch(`${root}/rest/people?${params.toString()}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Twenty ${response.status} while reading people`);
      return response.json();
    },
    readRows: (json) => readRecordList(json, "people"),
  });
  const phones = people.flatMap((person) => phonesFromTwentyComposite((person as { phones?: unknown }).phones).all);
  const counts = countAreaCodes(phones);
  console.log("areaCode,state,label,count");
  for (const row of counts.slice(0, 40)) {
    console.log(`${row.areaCode},${row.state ?? ""},${row.stateLabel},${row.count}`);
  }
  console.log(`\nRead ${people.length} people and ${phones.length} phone numbers. Buy local-presence numbers for the top area codes first.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});