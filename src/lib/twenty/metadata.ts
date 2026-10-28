import { readRecordList } from "@/lib/twenty/map";

export type MetadataRow = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readMetadataRows(json: unknown, plural: "objects" | "fields"): MetadataRow[] {
  const root = asRecord(json);
  if (!root) return [];
  if (Array.isArray(root.data)) return root.data.filter(isRow);
  const fromList = readRecordList(json, plural).filter(isRow);
  if (fromList.length > 0) return fromList;
  const data = asRecord(root.data);
  if (!data) return [];
  if (Array.isArray(data[plural])) return (data[plural] as unknown[]).filter(isRow);
  return [];
}

function isRow(value: unknown): value is MetadataRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pageInfo(json: unknown): { hasNextPage: boolean; endCursor: string | null } | null {
  const root = asRecord(json);
  const info = asRecord(root?.pageInfo) ?? asRecord(asRecord(root?.data)?.pageInfo);
  if (!info || !("hasNextPage" in info)) return null;
  const endCursor = typeof info.endCursor === "string" && info.endCursor ? info.endCursor : null;
  return { hasNextPage: info.hasNextPage === true, endCursor };
}

/** Field definitions nested on an object, whether they are a plain array or a connection. */
export function flattenMetadataFields(value: unknown): { name: string; type: string }[] {
  const rows = Array.isArray(value)
    ? value
    : readRecordList({ data: { fields: value } }, "fields");
  const fields: { name: string; type: string }[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record || typeof record.name !== "string") continue;
    fields.push({ name: record.name, type: typeof record.type === "string" ? record.type : "" });
  }
  return fields;
}

export function metadataFieldsFor(
  object: MetadataRow,
  fieldRows: MetadataRow[],
): { name: string; type: string }[] {
  const byName = new Map<string, { name: string; type: string }>();
  for (const field of flattenMetadataFields(object.fields)) byName.set(field.name, field);
  for (const field of fieldRows) {
    if (field.objectMetadataId !== object.id || typeof field.name !== "string") continue;
    byName.set(field.name, { name: field.name, type: typeof field.type === "string" ? field.type : "" });
  }
  return [...byName.values()];
}

/**
 * This Twenty build rejects every query string on `/rest/metadata/*` and returns
 * the whole collection in one response. Newer builds may paginate. Try the bare
 * path first, and only add limit/cursor when the server says another page exists.
 * If that follow-up is rejected, keep the page already received.
 */
export async function fetchMetadataCollection(
  kind: "objects" | "fields",
  get: (path: string) => Promise<unknown>,
): Promise<MetadataRow[]> {
  const bare = `/rest/metadata/${kind}`;
  try {
    const json = await get(bare);
    return collectMetadataPages(kind, json, get);
  } catch (bareError) {
    try {
      return await collectMetadataPages(kind, null, get);
    } catch {
      throw bareError;
    }
  }
}

async function collectMetadataPages(
  kind: "objects" | "fields",
  first: unknown | null,
  get: (path: string) => Promise<unknown>,
): Promise<MetadataRow[]> {
  const rows: MetadataRow[] = [];
  let json = first;
  let cursor: string | null = null;
  const seen = new Set<string>();
  for (let page = 0; page < 50; page += 1) {
    if (!json) {
      const params = new URLSearchParams({ limit: "200" });
      if (cursor) params.set("starting_after", cursor);
      try {
        json = await get(`/rest/metadata/${kind}?${params.toString()}`);
      } catch (error) {
        if (rows.length > 0) return rows;
        throw error;
      }
    }
    rows.push(...readMetadataRows(json, kind));
    const info = pageInfo(json);
    json = null;
    if (!info?.hasNextPage || !info.endCursor || seen.has(info.endCursor)) break;
    seen.add(info.endCursor);
    cursor = info.endCursor;
  }
  return rows;
}
