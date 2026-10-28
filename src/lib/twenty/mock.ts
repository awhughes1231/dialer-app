import { toE164 } from "@/lib/phone";
import type {
  TwentyCallWrite,
  TwentyClient,
  TwentyCompany,
  TwentyOpportunity,
  TwentyPerson,
} from "@/lib/twenty/types";

const bloom: TwentyCompany = {
  id: "22222222-2222-4222-8222-222222222221",
  name: "Bloom Goods",
  phones: [],
  primaryPhone: null,
  state: "CA",
  city: "San Francisco",
  dnc: "clear",
  dncFieldMissing: false,
};

const harbor: TwentyCompany = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Harbor Coffee",
  phones: [],
  primaryPhone: null,
  state: "NY",
  city: "New York",
  dnc: "clear",
  dncFieldMissing: false,
};

const miami: TwentyCompany = {
  id: "22222222-2222-4222-8222-222222222223",
  name: "Miami Home Co",
  phones: [],
  primaryPhone: null,
  state: "FL",
  city: "Miami",
  dnc: "clear",
  dncFieldMissing: false,
};

const northwind: TwentyCompany = {
  id: "22222222-2222-4222-8222-222222222224",
  name: "Northwind Outfitters",
  phones: ["+12065550177"],
  primaryPhone: "+12065550177",
  state: "WA",
  city: "Seattle",
  dnc: "clear",
  dncFieldMissing: false,
};

const national: TwentyCompany = {
  id: "22222222-2222-4222-8222-222222222225",
  name: "National Brand Co",
  phones: ["+18005550123"],
  primaryPhone: "+18005550123",
  state: "NY",
  city: "New York",
  dnc: "clear",
  dncFieldMissing: false,
};

export const MOCK_COMPANIES: TwentyCompany[] = [bloom, harbor, miami, northwind, national];

export const MOCK_PEOPLE: TwentyPerson[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    firstName: "Jordan",
    lastName: "Lee",
    name: "Jordan Lee",
    phones: ["+14155550100"],
    primaryPhone: "+14155550100",
    email: "jordan@bloomgoods.example",
    companyId: bloom.id,
    companyName: bloom.name,
    state: "CA",
    city: "San Francisco",
    dnc: "clear",
    dncFieldMissing: false,
  },
  {
    id: "11111111-1111-4111-8111-111111111112",
    firstName: "Sam",
    lastName: "Patel",
    name: "Sam Patel",
    phones: ["+12125550198"],
    primaryPhone: "+12125550198",
    email: "sam@harborcoffee.example",
    companyId: harbor.id,
    companyName: harbor.name,
    state: "NY",
    city: "New York",
    dnc: "clear",
    dncFieldMissing: false,
  },
  {
    id: "11111111-1111-4111-8111-111111111113",
    firstName: "Riley",
    lastName: "Chen",
    name: "Riley Chen",
    phones: ["+13055550111"],
    primaryPhone: "+13055550111",
    email: "riley@miamihome.example",
    companyId: miami.id,
    companyName: miami.name,
    state: "FL",
    city: "Miami",
    dnc: "clear",
    dncFieldMissing: false,
  },
  {
    id: "11111111-1111-4111-8111-111111111114",
    firstName: "Alex",
    lastName: "Nguyen",
    name: "Alex Nguyen",
    phones: ["+13125550100"],
    primaryPhone: "+13125550100",
    email: "alex@example.com",
    companyId: null,
    companyName: null,
    state: "IL",
    city: "Chicago",
    dnc: "flagged",
    dncFieldMissing: false,
  },
  {
    id: "11111111-1111-4111-8111-111111111115",
    firstName: "Casey",
    lastName: "Brooks",
    name: "Casey Brooks",
    phones: ["+19995550199"],
    primaryPhone: "+19995550199",
    email: null,
    companyId: null,
    companyName: null,
    state: null,
    city: null,
    dnc: "clear",
    dncFieldMissing: false,
  },
  {
    id: "11111111-1111-4111-8111-111111111116",
    firstName: "Morgan",
    lastName: "Diaz",
    name: "Morgan Diaz",
    phones: ["+15125550123"],
    primaryPhone: "+15125550123",
    email: "morgan@austin.example",
    companyId: null,
    companyName: "Austin Supply",
    state: "TX",
    city: "Austin",
    dnc: "clear",
    dncFieldMissing: false,
  },
];

export const MOCK_OPPORTUNITIES: TwentyOpportunity[] = [
  {
    id: "33333333-3333-4333-8333-333333333331",
    name: "Bloom Goods — retainer",
    stage: "Lead list",
    companyId: bloom.id,
    pointOfContactId: MOCK_PEOPLE[0].id,
    nextFollowUp: "2026-11-03",
    nextFollowUpFieldMissing: false,
    updatedAt: "2026-10-20T15:00:00.000Z",
  },
  {
    id: "33333333-3333-4333-8333-333333333332",
    name: "Harbor Coffee — proposal",
    stage: "Proposal sent (no 2nd)",
    companyId: harbor.id,
    pointOfContactId: MOCK_PEOPLE[1].id,
    nextFollowUp: "2026-10-30",
    nextFollowUpFieldMissing: false,
    updatedAt: "2026-10-18T15:00:00.000Z",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Closed Bloom deal",
    stage: "Deal won",
    companyId: bloom.id,
    pointOfContactId: MOCK_PEOPLE[0].id,
    nextFollowUp: null,
    nextFollowUpFieldMissing: false,
    updatedAt: "2026-09-01T15:00:00.000Z",
  },
];

function includesQuery(haystack: string, query: string): boolean {
  return haystack.toLowerCase().includes(query.toLowerCase());
}

export function createMockTwentyClient(): TwentyClient & {
  calls: (TwentyCallWrite & { id: string })[];
  notes: { id: string; title: string; markdown: string; personId?: string | null; companyId?: string | null; opportunityId?: string | null }[];
  followUps: { id: string; date: string }[];
} {
  const calls: (TwentyCallWrite & { id: string })[] = [];
  const notes: {
    id: string;
    title: string;
    markdown: string;
    personId?: string | null;
    companyId?: string | null;
    opportunityId?: string | null;
  }[] = [];
  const followUps: { id: string; date: string }[] = [];
  let counter = 1;

  const client: TwentyClient = {
    async getPerson(id) {
      return MOCK_PEOPLE.find((person) => person.id === id) ?? null;
    },
    async getCompany(id) {
      return MOCK_COMPANIES.find((company) => company.id === id) ?? null;
    },
    async getOpportunity(id) {
      return MOCK_OPPORTUNITIES.find((opportunity) => opportunity.id === id) ?? null;
    },
    async listOpportunitiesFor(args) {
      return MOCK_OPPORTUNITIES.filter(
        (opportunity) =>
          (args.personId && opportunity.pointOfContactId === args.personId) ||
          (args.companyId && opportunity.companyId === args.companyId),
      );
    },
    async searchPeople(query) {
      const digits = query.replace(/\D/g, "");
      return MOCK_PEOPLE.filter(
        (person) =>
          includesQuery(person.name, query) ||
          (digits.length >= 3 && person.phones.some((phone) => phone.includes(digits))),
      );
    },
    async searchCompanies(query) {
      return MOCK_COMPANIES.filter((company) => includesQuery(company.name, query));
    },
    async findPeopleByPhone(e164) {
      const target = toE164(e164);
      return MOCK_PEOPLE.filter((person) => person.phones.includes(target ?? e164));
    },
    async findCallByDialerId(dialerCallId) {
      const found = calls.find((call) => call.dialerCallId === dialerCallId);
      return found ? { id: found.id } : null;
    },
    async createCall(input) {
      const existing = calls.find((row) => row.dialerCallId === input.dialerCallId);
      if (existing) {
        Object.assign(existing, input);
        return { id: existing.id };
      }
      const row = { ...input, id: `mock-call-${counter++}` };
      calls.push(row);
      return { id: row.id };
    },
    async updateCall(id, input) {
      const row = calls.find((call) => call.id === id);
      if (!row) throw new Error(`Mock Twenty has no call ${id}`);
      Object.assign(row, input);
    },
    async createTimelineNote(input) {
      const note = { ...input, id: `mock-note-${counter++}` };
      notes.push(note);
      return { id: note.id };
    },
    async updateOpportunityFollowUp(id, date) {
      followUps.push({ id, date });
    },
    async setDoNotCall(args) {
      if (args.personId) {
        const person = MOCK_PEOPLE.find((item) => item.id === args.personId);
        if (person) person.dnc = "flagged";
      }
    },
  };

  return Object.assign(client, { calls, notes, followUps });
}
