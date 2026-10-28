import { normalizeState } from "@/lib/compliance/geography";
import { phonesFromTwentyComposite } from "@/lib/phone";
import type { TwentyCompany, TwentyDncStatus, TwentyOpportunity, TwentyPerson } from "@/lib/twenty/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function dncFromValue(value: unknown, fieldPresent: boolean): TwentyDncStatus {
  if (!fieldPresent) return "field_missing";
  if (value === true || value === "true") return "flagged";
  return "clear";
}

export function mapPerson(raw: unknown, options: { dncFieldPresent?: boolean } = {}): TwentyPerson | null {
  const record = asRecord(raw);
  if (!record || typeof record.id !== "string") return null;
  const name = asRecord(record.name);
  const firstName = text(name?.firstName) ?? "";
  const lastName = text(name?.lastName) ?? "";
  const phones = phonesFromTwentyComposite(record.phones);
  const emails = asRecord(record.emails);
  const address = asRecord(record.address);
  const company = asRecord(record.company);
  const companyId = text(record.companyId) ?? text(company?.id);
  const companyName = text(company?.name);
  const dncFieldPresent = options.dncFieldPresent ?? Object.prototype.hasOwnProperty.call(record, "doNotCall");
  return {
    id: record.id,
    firstName,
    lastName,
    name: [firstName, lastName].filter(Boolean).join(" ") || "Unnamed person",
    phones: phones.all,
    primaryPhone: phones.primary,
    email: text(emails?.primaryEmail),
    companyId,
    companyName,
    state: normalizeState(text(address?.addressState)),
    city: text(address?.addressCity),
    dnc: dncFromValue(record.doNotCall, dncFieldPresent),
    dncFieldMissing: !dncFieldPresent,
  };
}

export function mapCompany(raw: unknown, options: { dncFieldPresent?: boolean } = {}): TwentyCompany | null {
  const record = asRecord(raw);
  if (!record || typeof record.id !== "string") return null;
  const address = asRecord(record.address);
  const phones = phonesFromTwentyComposite(record.phones);
  const dncFieldPresent = options.dncFieldPresent ?? Object.prototype.hasOwnProperty.call(record, "doNotCall");
  return {
    id: record.id,
    name: text(record.name) ?? "Unnamed company",
    phones: phones.all,
    primaryPhone: phones.primary,
    state: normalizeState(text(address?.addressState)),
    city: text(address?.addressCity),
    dnc: dncFromValue(record.doNotCall, dncFieldPresent),
    dncFieldMissing: !dncFieldPresent,
  };
}

export function mapOpportunity(raw: unknown, options: { followUpFieldPresent?: boolean } = {}): TwentyOpportunity | null {
  const record = asRecord(raw);
  if (!record || typeof record.id !== "string") return null;
  const followUpFieldPresent =
    options.followUpFieldPresent ?? Object.prototype.hasOwnProperty.call(record, "nextFollowUp");
  const followUp = record.nextFollowUp;
  return {
    id: record.id,
    name: text(record.name) ?? "Untitled opportunity",
    stage: text(record.stage),
    companyId: text(record.companyId),
    pointOfContactId: text(record.pointOfContactId),
    nextFollowUp: followUpFieldPresent ? text(followUp) ?? (followUp instanceof Date ? followUp.toISOString() : null) : null,
    nextFollowUpFieldMissing: !followUpFieldPresent,
    updatedAt: text(record.updatedAt),
  };
}

export function readRecordList(json: unknown, plural: string): unknown[] {
  const root = asRecord(json);
  const data = asRecord(root?.data) ?? root;
  if (!data) return [];
  const value = data[plural];
  if (Array.isArray(value)) return value;
  const connection = asRecord(value);
  if (connection && Array.isArray(connection.edges)) {
    return connection.edges
      .map((edge) => asRecord(edge)?.node)
      .filter((node): node is Record<string, unknown> => Boolean(node));
  }
  if (Array.isArray(data.data)) return data.data as unknown[];
  return [];
}

export function readRecord(json: unknown, singular: string): unknown | null {
  const root = asRecord(json);
  const data = root?.data;
  if (Array.isArray(data)) return data[0] ?? null;
  const record = asRecord(data);
  if (!record) return null;
  if (record[singular]) return record[singular];
  if (typeof record.id === "string") return record;
  return null;
}

export function readCreatedId(json: unknown, singular: string): string | null {
  const root = asRecord(json);
  const data = asRecord(root?.data) ?? root;
  if (!data) return null;
  const direct = asRecord(data[singular]);
  if (typeof direct?.id === "string") return direct.id;
  const createKey = `create${singular.charAt(0).toUpperCase()}${singular.slice(1)}`;
  const created = asRecord(data[createKey]);
  if (typeof created?.id === "string") return created.id;
  if (typeof data.id === "string") return data.id;
  return null;
}

export function twentyErrorMessage(body: unknown, fallback: string): string {
  const record = asRecord(body);
  if (!record) return fallback;
  if (typeof record.error === "string") return record.error;
  if (typeof record.message === "string") return record.message;
  const messages = record.messages;
  if (Array.isArray(messages) && messages.length > 0) {
    const first = asRecord(messages[0]);
    if (typeof first?.message === "string") return first.message;
  }
  return fallback;
}

export function compactRecord<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== null && value !== undefined),
  ) as Partial<T>;
}

export function sanitizeSearchQuery(query: string): string {
  return query.replace(/["(),[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function twentyRoot(url: string): string {
  return url.replace(/\/+$/, "").replace(/\/rest$/i, "");
}

export function peopleSearchFilter(query: string): string {
  const safe = sanitizeSearchQuery(query);
  const digits = safe.replace(/\D/g, "");
  const parts = [
    `name.firstName[ilike]:"%${safe}%"`,
    `name.lastName[ilike]:"%${safe}%"`,
  ];
  if (digits.length >= 3) parts.push(`phones.primaryPhoneNumber[ilike]:"%${digits}%"`);
  return `or(${parts.join(",")})`;
}
