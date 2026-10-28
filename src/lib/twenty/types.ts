export type TwentyDncStatus = "clear" | "flagged" | "unknown" | "field_missing" | "not_applicable";

export type TwentyPerson = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  phones: string[];
  primaryPhone: string | null;
  email: string | null;
  companyId: string | null;
  companyName: string | null;
  state: string | null;
  city: string | null;
  dnc: TwentyDncStatus;
  dncFieldMissing: boolean;
};

export type TwentyCompany = {
  id: string;
  name: string;
  phones: string[];
  primaryPhone: string | null;
  state: string | null;
  city: string | null;
  dnc: TwentyDncStatus;
  dncFieldMissing: boolean;
};

export type TwentyOpportunity = {
  id: string;
  name: string;
  stage: string | null;
  companyId: string | null;
  pointOfContactId: string | null;
  nextFollowUp: string | null;
  nextFollowUpFieldMissing: boolean;
  updatedAt: string | null;
};

export type TwentyCallWrite = {
  name: string;
  direction: "OUTBOUND" | "INBOUND";
  fromNumber?: string | null;
  toNumber: string;
  repName?: string | null;
  repEmail?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  disposition?: string | null;
  notes?: string | null;
  recordingUrl?: string | null;
  disclosurePlayed?: boolean;
  prospectTimezone?: string | null;
  dialerCallId: string;
  personId?: string | null;
  companyId?: string | null;
  opportunityId?: string | null;
};

export type TwentyClient = {
  getPerson(id: string): Promise<TwentyPerson | null>;
  getCompany(id: string): Promise<TwentyCompany | null>;
  getOpportunity(id: string): Promise<TwentyOpportunity | null>;
  listOpportunitiesFor(args: { personId?: string | null; companyId?: string | null }): Promise<TwentyOpportunity[]>;
  searchPeople(query: string): Promise<TwentyPerson[]>;
  searchCompanies(query: string): Promise<TwentyCompany[]>;
  findPeopleByPhone(e164: string): Promise<TwentyPerson[]>;
  findCallByDialerId(dialerCallId: string): Promise<{ id: string } | null>;
  createCall(input: TwentyCallWrite): Promise<{ id: string }>;
  updateCall(id: string, input: Partial<TwentyCallWrite>): Promise<void>;
  createTimelineNote(input: {
    title: string;
    markdown: string;
    personId?: string | null;
    companyId?: string | null;
    opportunityId?: string | null;
  }): Promise<{ id: string }>;
  updateOpportunityFollowUp(id: string, date: string): Promise<void>;
  setDoNotCall(args: { personId?: string | null; companyId?: string | null }): Promise<void>;
};

export const CLOSED_OPPORTUNITY_STAGES = new Set([
  "deal won",
  "deal cold",
  "no - not for now",
  "no - forever",
  "no-not for now",
  "no-forever",
]);

export function isClosedStage(stage: string | null | undefined): boolean {
  if (!stage) return false;
  return CLOSED_OPPORTUNITY_STAGES.has(stage.trim().toLowerCase());
}

export function pickOpenOpportunity(opportunities: TwentyOpportunity[]): TwentyOpportunity | null {
  const open = opportunities.filter((opportunity) => !isClosedStage(opportunity.stage));
  if (open.length === 0) return null;
  return open
    .slice()
    .sort((a, b) => {
      const aFollow = a.nextFollowUp ?? "";
      const bFollow = b.nextFollowUp ?? "";
      if (aFollow && bFollow && aFollow !== bFollow) return aFollow < bFollow ? -1 : 1;
      if (aFollow && !bFollow) return -1;
      if (!aFollow && bFollow) return 1;
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    })[0];
}
