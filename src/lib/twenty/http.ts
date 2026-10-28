import {
  compactRecord,
  mapCompany,
  mapOpportunity,
  mapPerson,
  peopleSearchFilter,
  readCreatedId,
  readRecord,
  readRecordList,
  sanitizeSearchQuery,
  twentyErrorMessage,
  twentyRoot,
} from "@/lib/twenty/map";
import type { TwentyCallWrite, TwentyClient, TwentyCompany, TwentyOpportunity, TwentyPerson } from "@/lib/twenty/types";

type FetchLike = typeof fetch;

export class TwentyRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

function mentions(body: unknown, field: string): boolean {
  return JSON.stringify(body ?? "").toLowerCase().includes(field.toLowerCase());
}

export class HttpTwentyClient implements TwentyClient {
  private readonly root: string;

  constructor(
    private readonly options: {
      baseUrl: string;
      apiKey: string;
      fetchImpl?: FetchLike;
      timeoutMs?: number;
    },
  ) {
    if (!options.apiKey) throw new Error("TWENTY_API_KEY is not set");
    this.root = twentyRoot(options.baseUrl || "https://crm.ecommercewala.co");
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10_000);
    try {
      const response = await (this.options.fetchImpl ?? fetch)(`${this.root}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      });
      const text = await response.text();
      const body = text ? safeJson(text) : null;
      if (!response.ok) {
        throw new TwentyRequestError(
          twentyErrorMessage(body, `Twenty returned ${response.status} for ${path}`),
          response.status,
          body,
        );
      }
      return body;
    } catch (error) {
      if (error instanceof TwentyRequestError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new TwentyRequestError("Twenty did not respond in time", 504, null);
      }
      throw new TwentyRequestError(error instanceof Error ? error.message : "Twenty request failed", 0, null);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getWithOptional(path: string, fields: string[], optional: string[]): Promise<{ json: unknown; dropped: string[] }> {
    const query = (selected: string[]) => {
      const join = path.includes("?") ? "&" : "?";
      return `${path}${join}fields=${selected.join(",")}&depth=0`;
    };
    try {
      const json = await this.request(query([...fields, ...optional]));
      return { json, dropped: [] };
    } catch (error) {
      if (error instanceof TwentyRequestError && error.status === 400 && optional.some((field) => mentions(error.body, field))) {
        const dropped = optional.filter((field) => mentions(error.body, field));
        const json = await this.request(query(fields));
        return { json, dropped };
      }
      throw error;
    }
  }

  async getPerson(id: string): Promise<TwentyPerson | null> {
    try {
      const { json, dropped } = await this.getWithOptional(
        `/rest/people/${encodeURIComponent(id)}`,
        ["id", "name", "phones", "emails", "companyId", "address"],
        ["doNotCall"],
      );
      const person = mapPerson(readRecord(json, "person"), { dncFieldPresent: !dropped.includes("doNotCall") });
      if (person?.companyId) {
        const company = await this.getCompany(person.companyId);
        if (company) person.companyName = company.name;
      }
      return person;
    } catch (error) {
      if (error instanceof TwentyRequestError && error.status === 404) return null;
      throw error;
    }
  }

  async getCompany(id: string): Promise<TwentyCompany | null> {
    try {
      const { json, dropped } = await this.getWithOptional(
        `/rest/companies/${encodeURIComponent(id)}`,
        ["id", "name", "address", "phones"],
        ["doNotCall"],
      );
      return mapCompany(readRecord(json, "company"), { dncFieldPresent: !dropped.includes("doNotCall") });
    } catch (error) {
      if (error instanceof TwentyRequestError && (error.status === 404 || (error.status === 400 && mentions(error.body, "phones")))) {
        if (error.status === 400) {
          const { json, dropped } = await this.getWithOptional(
            `/rest/companies/${encodeURIComponent(id)}`,
            ["id", "name", "address"],
            ["doNotCall"],
          );
          return mapCompany(readRecord(json, "company"), { dncFieldPresent: !dropped.includes("doNotCall") });
        }
        return null;
      }
      throw error;
    }
  }

  async getOpportunity(id: string): Promise<TwentyOpportunity | null> {
    try {
      const { json, dropped } = await this.getWithOptional(
        `/rest/opportunities/${encodeURIComponent(id)}`,
        ["id", "name", "stage", "companyId", "pointOfContactId", "updatedAt"],
        ["nextFollowUp"],
      );
      return mapOpportunity(readRecord(json, "opportunity"), {
        followUpFieldPresent: !dropped.includes("nextFollowUp"),
      });
    } catch (error) {
      if (error instanceof TwentyRequestError && error.status === 404) return null;
      throw error;
    }
  }

  async listOpportunitiesFor(args: { personId?: string | null; companyId?: string | null }): Promise<TwentyOpportunity[]> {
    const filters: string[] = [];
    if (args.personId) filters.push(`pointOfContactId[eq]:"${args.personId}"`);
    if (args.companyId) filters.push(`companyId[eq]:"${args.companyId}"`);
    if (filters.length === 0) return [];
    const filter = filters.length === 1 ? filters[0] : `or(${filters.join(",")})`;
    try {
      return await this.fetchOpportunities(filter, true);
    } catch (error) {
      if (error instanceof TwentyRequestError && error.status === 400 && args.companyId) {
        return this.fetchOpportunities(`companyId[eq]:"${args.companyId}"`, false);
      }
      throw error;
    }
  }

  private async fetchOpportunities(filter: string, withContact: boolean): Promise<TwentyOpportunity[]> {
    const fields = ["id", "name", "stage", "companyId", "updatedAt", ...(withContact ? ["pointOfContactId"] : []), "nextFollowUp"];
    const optional = ["nextFollowUp"];
    const base = ["id", "name", "stage", "companyId", "updatedAt", ...(withContact ? ["pointOfContactId"] : [])];
    const { json, dropped } = await this.getWithOptional(
      `/rest/opportunities?filter=${encodeURIComponent(filter)}&limit=20`,
      base,
      optional.filter((field) => fields.includes(field)),
    );
    return readRecordList(json, "opportunities")
      .map((row) => mapOpportunity(row, { followUpFieldPresent: !dropped.includes("nextFollowUp") }))
      .filter((row): row is TwentyOpportunity => Boolean(row));
  }

  async searchPeople(query: string): Promise<TwentyPerson[]> {
    const safe = sanitizeSearchQuery(query);
    if (!safe) return [];
    const filter = peopleSearchFilter(safe);
    const { json, dropped } = await this.getWithOptional(
      `/rest/people?filter=${encodeURIComponent(filter)}&limit=20`,
      ["id", "name", "phones", "emails", "companyId", "address"],
      ["doNotCall"],
    );
    return readRecordList(json, "people")
      .map((row) => mapPerson(row, { dncFieldPresent: !dropped.includes("doNotCall") }))
      .filter((row): row is TwentyPerson => Boolean(row));
  }

  async searchCompanies(query: string): Promise<TwentyCompany[]> {
    const safe = sanitizeSearchQuery(query);
    if (!safe) return [];
    const filter = `name[ilike]:"%${safe}%"`;
    try {
      const { json, dropped } = await this.getWithOptional(
        `/rest/companies?filter=${encodeURIComponent(filter)}&limit=10`,
        ["id", "name", "address"],
        ["doNotCall"],
      );
      return readRecordList(json, "companies")
        .map((row) => mapCompany(row, { dncFieldPresent: !dropped.includes("doNotCall") }))
        .filter((row): row is TwentyCompany => Boolean(row));
    } catch (error) {
      if (error instanceof TwentyRequestError) return [];
      throw error;
    }
  }

  async findPeopleByPhone(e164: string): Promise<TwentyPerson[]> {
    const digits = e164.replace(/\D/g, "");
    const national = digits.startsWith("1") ? digits.slice(1) : digits;
    return this.searchPeople(national);
  }

  async findCallByDialerId(dialerCallId: string): Promise<{ id: string } | null> {
    const filter = `dialerCallId[eq]:"${dialerCallId}"`;
    const json = await this.request(`/rest/calls?filter=${encodeURIComponent(filter)}&limit=1&fields=id,dialerCallId`);
    const [first] = readRecordList(json, "calls");
    const record = first && typeof first === "object" && first !== null && "id" in first ? first : null;
    return record && typeof record.id === "string" ? { id: record.id } : null;
  }

  async createCall(input: TwentyCallWrite): Promise<{ id: string }> {
    const json = await this.request("/rest/calls", {
      method: "POST",
      body: JSON.stringify(compactRecord(input as unknown as Record<string, unknown>)),
    });
    const id = readCreatedId(json, "call");
    if (!id) throw new TwentyRequestError("Twenty did not return a call id", 502, json);
    return { id };
  }

  async updateCall(id: string, input: Partial<TwentyCallWrite>): Promise<void> {
    await this.request(`/rest/calls/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(compactRecord(input as Record<string, unknown>)),
    });
  }

  async createTimelineNote(input: {
    title: string;
    markdown: string;
    personId?: string | null;
    companyId?: string | null;
    opportunityId?: string | null;
  }): Promise<{ id: string }> {
    const json = await this.request("/rest/notes", {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        bodyV2: { markdown: input.markdown },
      }),
    });
    const id = readCreatedId(json, "note");
    if (!id) throw new TwentyRequestError("Twenty did not return a note id", 502, json);
    const targets = [
      input.personId ? { personId: input.personId } : null,
      input.companyId ? { companyId: input.companyId } : null,
      input.opportunityId ? { opportunityId: input.opportunityId } : null,
    ].filter((target): target is { personId: string } | { companyId: string } | { opportunityId: string } => Boolean(target));
    for (const target of targets) {
      await this.request("/rest/noteTargets", {
        method: "POST",
        body: JSON.stringify({ noteId: id, ...target }),
      });
    }
    return { id };
  }

  async updateOpportunityFollowUp(id: string, date: string): Promise<void> {
    try {
      await this.request(`/rest/opportunities/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ nextFollowUp: date }),
      });
    } catch (error) {
      if (error instanceof TwentyRequestError && error.status === 400 && mentions(error.body, "nextFollowUp")) {
        throw new TwentyRequestError(
          "Twenty opportunity has no nextFollowUp field. Run the setup notes in the README before saving follow-up dates.",
          400,
          error.body,
        );
      }
      throw error;
    }
  }

  async setDoNotCall(args: { personId?: string | null; companyId?: string | null }): Promise<void> {
    if (args.personId) {
      await this.request(`/rest/people/${encodeURIComponent(args.personId)}`, {
        method: "PATCH",
        body: JSON.stringify({ doNotCall: true }),
      });
    }
    if (args.companyId && !args.personId) {
      await this.request(`/rest/companies/${encodeURIComponent(args.companyId)}`, {
        method: "PATCH",
        body: JSON.stringify({ doNotCall: true }),
      });
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}
