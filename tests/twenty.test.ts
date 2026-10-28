import { describe, expect, it, vi } from "vitest";
import { countAreaCodes } from "@/lib/reports/area-codes";
import { HttpTwentyClient } from "@/lib/twenty/http";
import { fetchMetadataCollection, metadataFieldsFor } from "@/lib/twenty/metadata";
import { compactRecord, mapCompany, mapPerson, peopleSearchFilter, readCreatedId, readRecordList, twentyRoot } from "@/lib/twenty/map";
import { collectPages, DEFAULT_MAX_PAGES } from "@/lib/twenty/paging";
import { createMockTwentyClient, MOCK_OPPORTUNITIES } from "@/lib/twenty/mock";
import { planTwentySetup } from "@/lib/twenty/schema";
import { buildCallNote, syncCallToTwenty, toTwentyCallWrite, type SyncableCall } from "@/lib/twenty/sync";
import { pickOpenOpportunity } from "@/lib/twenty/types";

const call: SyncableCall = {
  id: "call-1",
  status: "ENDED",
  direction: "OUTBOUND",
  fromNumber: "+14155551000",
  toNumber: "+12125550198",
  repName: "Ada Rep",
  repEmail: "ada@ecommercewala.co",
  prospectName: "Sam Patel",
  companyName: "Harbor Coffee",
  personId: "11111111-1111-4111-8111-111111111112",
  companyId: "22222222-2222-4222-8222-222222222222",
  opportunityId: "33333333-3333-4333-8333-333333333332",
  startedAt: new Date("2026-10-28T15:00:00.000Z"),
  endedAt: new Date("2026-10-28T15:03:12.000Z"),
  durationSeconds: 192,
  disposition: "CONNECTED",
  notes: "Asked for the founder.",
  recordingUrl: "https://recordings.example/call-1.mp3",
  disclosurePlayed: true,
  prospectTimezone: "America/New_York",
  complianceSummary: "Inside the calling window.",
  twentyCallId: null,
};

describe("Twenty call sync", () => {
  it("writes a structured call and a timeline note, then updates the same record", async () => {
    const client = createMockTwentyClient();
    const first = await syncCallToTwenty(client, call, { nextFollowUp: "2026-11-04" });
    expect(first.status).toBe("synced");
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]).toMatchObject({
      direction: "OUTBOUND",
      fromNumber: "+14155551000",
      toNumber: "+12125550198",
      repEmail: "ada@ecommercewala.co",
      disposition: "CONNECTED",
      durationSeconds: 192,
      recordingUrl: "https://recordings.example/call-1.mp3",
      disclosurePlayed: true,
      dialerCallId: "call-1",
      personId: call.personId,
    });
    expect(client.notes[0].markdown).toMatch(/Connected/);
    expect(client.notes[0].markdown).toMatch(/Ada Rep/);
    expect(client.notes[0].markdown).toMatch(/recordings\.example/);
    expect(client.followUps).toEqual([{ id: call.opportunityId, date: "2026-11-04" }]);

    const second = await syncCallToTwenty(client, {
      ...call,
      twentyCallId: first.twentyCallId,
      twentyNoteId: first.twentyNoteId,
      notes: "Updated note",
    });
    expect(second.status).toBe("synced");
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].notes).toBe("Updated note");
    expect(client.notes).toHaveLength(1);
  });

  it("does not send blocked attempts or calls without a disposition", async () => {
    const client = createMockTwentyClient();
    expect((await syncCallToTwenty(client, { ...call, status: "BLOCKED" })).status).toBe("skipped");
    expect((await syncCallToTwenty(client, { ...call, disposition: null })).status).toBe("skipped");
    expect(client.calls).toHaveLength(0);
  });

  it("keeps the local result when Twenty fails and still reports a note failure separately", async () => {
    const client = createMockTwentyClient();
    client.createCall = async () => {
      throw new Error("Calls object not found. Run the setup script.");
    };
    const failed = await syncCallToTwenty(client, call);
    expect(failed.status).toBe("error");
    expect(failed.error).toMatch(/setup script/);

    const noteClient = createMockTwentyClient();
    noteClient.createTimelineNote = async () => {
      throw new Error("note target rejected");
    };
    const partial = await syncCallToTwenty(noteClient, call);
    expect(partial.status).toBe("synced");
    expect(partial.warnings.join(" ")).toMatch(/Timeline note failed/);
  });

  it("omits empty relations and builds the note from the call", () => {
    const payload = compactRecord(toTwentyCallWrite({ ...call, personId: null, companyId: null }) as unknown as Record<string, unknown>);
    expect(payload).not.toHaveProperty("personId");
    expect(payload).not.toHaveProperty("companyId");
    expect(buildCallNote(call).title).toMatch(/Sam Patel/);
  });

  it("maps Twenty phone composites and picks the open opportunity", () => {
    const mapped = mapPerson({
      id: "11111111-1111-4111-8111-111111111111",
      name: { firstName: "Jordan", lastName: "Lee" },
      phones: {
        primaryPhoneNumber: "(415) 555-0100",
        primaryPhoneCountryCode: "US",
        primaryPhoneCallingCode: "+1",
        additionalPhones: ["628-555-0199"],
      },
      emails: { primaryEmail: "jordan@bloomgoods.example" },
      address: { addressCity: "San Francisco", addressState: "California" },
      doNotCall: false,
      companyId: "22222222-2222-4222-8222-222222222221",
    });
    expect(mapped?.phones).toEqual(["+14155550100", "+16285550199"]);
    expect(mapped?.state).toBe("CA");
    expect(mapped?.dnc).toBe("clear");
    expect(mapCompany({ id: "c", name: "Bloom", address: { addressState: "CA" } })?.dnc).toBe("field_missing");
    expect(pickOpenOpportunity(MOCK_OPPORTUNITIES.filter((item) => item.companyId === "22222222-2222-4222-8222-222222222221"))?.stage).toBe("Lead list");
  });
});

describe("Twenty HTTP client", () => {
  it("sends the bearer key and retries without an unknown doNotCall field", async () => {
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).includes("doNotCall")) {
        return new Response(JSON.stringify({ messages: [{ message: "unknown field doNotCall" }] }), { status: 400 });
      }
      return new Response(
        JSON.stringify({
          data: {
            person: {
              id: "11111111-1111-4111-8111-111111111111",
              name: { firstName: "Sam", lastName: "Patel" },
              phones: { primaryPhoneNumber: "+1 212 555 0198" },
            },
          },
        }),
        { status: 200 },
      );
    });
    const client = new HttpTwentyClient({
      baseUrl: "https://crm.ecommercewala.co/rest/",
      apiKey: "secret-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const person = await client.getPerson("11111111-1111-4111-8111-111111111111");
    expect(person?.name).toBe("Sam Patel");
    expect(person?.primaryPhone).toBe("+12125550198");
    expect(person?.dncFieldMissing).toBe(true);
    const firstCall = fetchImpl.mock.calls[0];
    expect(String(firstCall?.[0])).toContain("https://crm.ecommercewala.co/rest/people/");
    expect((firstCall?.[1] as RequestInit | undefined)?.headers).toMatchObject({ Authorization: "Bearer secret-key" });
  });

  it("creates a call from the legacy createOneCall envelope", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "GET") return new Response(JSON.stringify({ data: { calls: [] } }), { status: 200 });
      expect(String(url)).toBe("https://crm.ecommercewala.co/rest/calls");
      return new Response(JSON.stringify({ data: { createOneCall: { id: "twenty-1" } } }), { status: 201 });
    });
    const client = new HttpTwentyClient({
      baseUrl: "https://crm.ecommercewala.co",
      apiKey: "secret-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const created = await client.createCall(toTwentyCallWrite(call));
    expect(created.id).toBe("twenty-1");
    const post = fetchImpl.mock.calls.find((entry) => (entry[1] as RequestInit | undefined)?.method === "POST");
    const body = JSON.parse(String((post?.[1] as RequestInit | undefined)?.body));
    expect(body.dialerCallId).toBe("call-1");
    expect(body.disposition).toBe("CONNECTED");
  });

  it("updates the existing Twenty call when dialerCallId is already there", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "GET") {
        return new Response(
          JSON.stringify({ data: { calls: [{ id: "existing-call", dialerCallId: "call-1" }] } }),
          { status: 200 },
        );
      }
      if (method === "POST") return new Response("should not create", { status: 500 });
      return new Response(JSON.stringify({ data: { updateCall: { id: "existing-call" } } }), { status: 200 });
    });
    const client = new HttpTwentyClient({
      baseUrl: "https://crm.ecommercewala.co",
      apiKey: "secret-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const created = await client.createCall(toTwentyCallWrite(call));
    expect(created.id).toBe("existing-call");
    expect(fetchImpl.mock.calls.some((entry) => (entry[1] as RequestInit | undefined)?.method === "POST")).toBe(false);
    const patch = fetchImpl.mock.calls.find((entry) => (entry[1] as RequestInit | undefined)?.method === "PATCH");
    expect(String(patch?.[0])).toContain("/rest/calls/existing-call");
  });
});

describe("Twenty response shapes", () => {
  it("reads create ids from the legacy and direct envelopes", () => {
    expect(readCreatedId({ data: { createOneObject: { id: "11111111-1111-4111-8111-111111111111", nameSingular: "call" } } }, "object")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(readCreatedId({ data: { createOneCall: { id: "22222222-2222-4222-8222-222222222222" } } }, "call")).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(readCreatedId({ data: { id: "33333333-3333-4333-8333-333333333333", nameSingular: "call" } }, "object")).toBe(
      "33333333-3333-4333-8333-333333333333",
    );
    expect(readCreatedId({ id: "44444444-4444-4444-8444-444444444444", nameSingular: "call" }, "object")).toBe(
      "44444444-4444-4444-8444-444444444444",
    );
  });

  it("loads metadata with no query string, and keeps that page if a cursor request is rejected", async () => {
    const paths: string[] = [];
    const rows = await fetchMetadataCollection("objects", async (path) => {
      paths.push(path);
      if (path.includes("?")) throw new Error("Bad Request");
      return {
        data: {
          objects: [
            { id: "call-id", nameSingular: "call" },
            { id: "person-id", nameSingular: "person" },
          ],
        },
      };
    });
    expect(paths).toEqual(["/rest/metadata/objects"]);
    expect(rows.map((row) => row.nameSingular)).toEqual(["call", "person"]);

    const paged = await fetchMetadataCollection("fields", async (path) => {
      if (path.includes("?")) throw new Error("Bad Request");
      return {
        data: { fields: [{ id: "f1", name: "dialerCallId", objectMetadataId: "call-id" }] },
        pageInfo: { hasNextPage: true, endCursor: "next" },
      };
    });
    expect(paged).toHaveLength(1);
    expect(paged[0]?.name).toBe("dialerCallId");
  });

  it("falls back to a paged metadata read when the bare path fails", async () => {
    const paths: string[] = [];
    const rows = await fetchMetadataCollection("objects", async (path) => {
      paths.push(path);
      if (!path.includes("?")) throw new Error("bare path unavailable");
      return { data: [{ id: "obj-1", nameSingular: "call" }], pageInfo: { hasNextPage: false } };
    });
    expect(paths[0]).toBe("/rest/metadata/objects");
    expect(paths[1]).toContain("limit=200");
    expect(rows[0]?.nameSingular).toBe("call");
  });
});

describe("Twenty setup plan", () => {
  it("is a no-op when fields are nested the way this CRM returns them", () => {
    const names = [
      "direction", "fromNumber", "toNumber", "repName", "repEmail", "startedAt", "endedAt",
      "durationSeconds", "disposition", "notes", "recordingUrl", "disclosurePlayed",
      "prospectTimezone", "dialerCallId", "person", "company", "opportunity",
    ];
    const edges = (fieldNames: string[]) => ({
      edges: fieldNames.map((name) => ({ node: { name, type: "TEXT" } })),
    });
    const person = { id: "p", nameSingular: "person", fields: metadataFieldsFor({ id: "p", fields: edges(["doNotCall"]) }, []) };
    const company = { id: "c", nameSingular: "company", fields: metadataFieldsFor({ id: "c", fields: edges(["doNotCall"]) }, []) };
    const opportunity = {
      id: "o",
      nameSingular: "opportunity",
      fields: metadataFieldsFor({ id: "o", fields: edges(["nextFollowUp"]) }, []),
    };
    const callObject = { id: "call-id", nameSingular: "call", fields: metadataFieldsFor({ id: "call-id", fields: edges(names) }, []) };
    expect(planTwentySetup([person, company, opportunity, callObject])).toEqual([]);
  });

  it("is a no-op once the call object and DNC fields exist", () => {
    const fields = [
      "direction", "fromNumber", "toNumber", "repName", "repEmail", "startedAt", "endedAt",
      "durationSeconds", "disposition", "notes", "recordingUrl", "disclosurePlayed",
      "prospectTimezone", "dialerCallId", "person", "company", "opportunity",
    ].map((name) => ({ name, type: "TEXT" }));
    const actions = planTwentySetup([
      { id: "p", nameSingular: "person", fields: [{ name: "doNotCall", type: "BOOLEAN" }] },
      { id: "c", nameSingular: "company", fields: [{ name: "doNotCall", type: "BOOLEAN" }] },
      { id: "o", nameSingular: "opportunity", fields: [{ name: "nextFollowUp", type: "DATE_TIME" }] },
      { id: "call", nameSingular: "call", fields },
    ]);
    expect(actions).toEqual([]);
  });

  it("plans the call object and warns instead of recreating next follow-up", () => {
    const actions = planTwentySetup([
      { id: "p", nameSingular: "person", fields: [] },
      { id: "c", nameSingular: "company", fields: [] },
      { id: "o", nameSingular: "opportunity", fields: [] },
    ]);
    expect(actions.some((action) => action.kind === "create_object")).toBe(true);
    expect(actions.some((action) => action.kind === "create_field" && action.name === "doNotCall" && action.object === "person")).toBe(true);
    expect(actions.some((action) => action.kind === "warning" && action.message.includes("nextFollowUp"))).toBe(true);
    expect(actions.some((action) => action.kind === "create_field" && action.name === "nextFollowUp")).toBe(false);
  });
});

describe("people pagination", () => {
  it("reads every page until Twenty reports the end, past the old 1,200-person cap", async () => {
    const cursors: Array<string | null> = [];
    const rows = await collectPages({
      plural: "people",
      pageSize: 2,
      maxPages: DEFAULT_MAX_PAGES,
      fetchPage: async (cursor) => {
        cursors.push(cursor);
        const page = cursors.length;
        const last = page === 3;
        return {
          data: { people: [{ id: `p${page}` }] },
          pageInfo: { hasNextPage: !last, endCursor: last ? null : `c${page}` },
          totalCount: 3,
        };
      },
      readRows: (json) => readRecordList(json, "people"),
    });
    expect(cursors).toEqual([null, "c1", "c2"]);
    expect(rows).toHaveLength(3);
    expect(DEFAULT_MAX_PAGES).toBeGreaterThan(20);
  });
});

describe("area-code buying report", () => {
  it("counts normalized numbers", () => {
    const rows = countAreaCodes(["(415) 555-0100", "+14155550199", "+12125550100", "not a phone"]);
    expect(rows[0]).toMatchObject({ areaCode: "415", state: "CA", count: 2 });
    expect(rows[1]).toMatchObject({ areaCode: "212", count: 1 });
  });

  it("sanitizes search text before it is placed in a Twenty filter", () => {
    expect(peopleSearchFilter('Sam",or(id[eq]:"x")')).not.toContain("or(id");
    expect(twentyRoot("https://crm.ecommercewala.co/rest/")).toBe("https://crm.ecommercewala.co");
  });
});
