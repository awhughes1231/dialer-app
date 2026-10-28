import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getTwentyClient } from "@/lib/twenty";
import { sanitizeSearchQuery } from "@/lib/twenty/map";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireUser();
    const query = sanitizeSearchQuery(new URL(request.url).searchParams.get("q") ?? "");
    if (query.length < 2) return NextResponse.json({ people: [], companies: [] });
    const twenty = getTwentyClient();
    const [people, companies] = await Promise.all([twenty.searchPeople(query), twenty.searchCompanies(query)]);
    return NextResponse.json({
      people: people.map((person) => ({
        id: person.id,
        name: person.name,
        companyName: person.companyName,
        phone: person.primaryPhone,
        state: person.state,
        dnc: person.dnc === "flagged",
      })),
      companies: companies.map((company) => ({
        id: company.id,
        name: company.name,
        phone: company.primaryPhone,
        state: company.state,
        dnc: company.dnc === "flagged",
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
