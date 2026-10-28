import { readRecordList } from "@/lib/twenty/map";

/** Safety stop. 1,000 pages of 60 is 60k records, well above this CRM. */
export const DEFAULT_MAX_PAGES = 1000;
export const PEOPLE_PAGE_SIZE = 60;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readPageInfo(json: unknown): { present: boolean; hasNextPage: boolean; endCursor: string | null; totalCount: number | null } {
  const root = asRecord(json);
  const info = asRecord(root?.pageInfo) ?? asRecord(asRecord(root?.data)?.pageInfo);
  const total = root?.totalCount ?? asRecord(root?.data)?.totalCount;
  return {
    present: Boolean(info && "hasNextPage" in info),
    hasNextPage: info?.hasNextPage === true,
    endCursor: typeof info?.endCursor === "string" && info.endCursor ? info.endCursor : null,
    totalCount: typeof total === "number" ? total : null,
  };
}

/** Cursor for the next page, or null when this page is the last one. */
export function nextCursor(json: unknown, plural: string, pageSize: number): string | null {
  const info = readPageInfo(json);
  const rows = readRecordList(json, plural);
  if (info.present && !info.hasNextPage) return null;
  if (info.totalCount != null && rows.length >= info.totalCount && !info.hasNextPage) return null;
  if (info.endCursor) return info.endCursor;
  if (rows.length < pageSize) return null;
  const last = asRecord(rows[rows.length - 1]);
  return typeof last?.id === "string" ? last.id : null;
}

export async function collectPages<T>(options: {
  plural: string;
  pageSize: number;
  maxPages?: number;
  pauseMs?: number;
  fetchPage: (cursor: string | null) => Promise<unknown>;
  readRows: (json: unknown) => T[];
}): Promise<T[]> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const collected: T[] = [];
  const seen = new Set<string | null>();
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    if (page > 0 && options.pauseMs) {
      await new Promise((resolve) => setTimeout(resolve, options.pauseMs));
    }
    const json = await options.fetchPage(cursor);
    const rows = options.readRows(json);
    collected.push(...rows);
    const info = readPageInfo(json);
    if (info.totalCount != null && collected.length >= info.totalCount) break;
    const next = nextCursor(json, options.plural, options.pageSize);
    if (!next || next === cursor) break;
    cursor = next;
  }
  return collected;
}
