import { planTwentySetup, type MetadataObject, type SetupAction } from "../src/lib/twenty/schema";
import { readCreatedId, twentyErrorMessage, twentyRoot } from "../src/lib/twenty/map";

const apply = process.argv.includes("--apply");
const withFollowUp = process.argv.includes("--with-next-follow-up");
const apiKey = process.env.TWENTY_API_KEY?.trim() ?? "";
const root = twentyRoot(process.env.TWENTY_API_URL?.trim() || "https://crm.ecommercewala.co");
const followUpField = process.env.TWENTY_NEXT_FOLLOW_UP_FIELD?.trim() || "nextFollowUp";

if (!apiKey) {
  console.error("Set TWENTY_API_KEY. This script is meant to be run by Aaron against the CRM. It does nothing without a key.");
  process.exit(1);
}

async function twenty(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${root}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(twentyErrorMessage(body, `Twenty ${response.status} ${path}`));
  }
  return body;
}

function rows(json: unknown, plural: string): Record<string, unknown>[] {
  if (!json || typeof json !== "object") return [];
  const record = json as { data?: unknown; pageInfo?: { hasNextPage?: boolean; endCursor?: string } };
  const data = record.data;
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const nested = data as Record<string, unknown>;
    if (Array.isArray(nested[plural])) return nested[plural] as Record<string, unknown>[];
    const connection = nested[plural] as { edges?: { node?: Record<string, unknown> }[] } | undefined;
    if (Array.isArray(connection?.edges)) {
      return connection.edges.map((edge) => edge.node).filter((node): node is Record<string, unknown> => Boolean(node));
    }
  }
  return [];
}

async function listAll(kind: "objects" | "fields"): Promise<Record<string, unknown>[]> {
  const collected: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 30; page += 1) {
    const params = new URLSearchParams({ limit: "200" });
    if (cursor) params.set("starting_after", cursor);
    const json = (await twenty(`/rest/metadata/${kind}?${params.toString()}`)) as {
      pageInfo?: { hasNextPage?: boolean; endCursor?: string };
      data?: { pageInfo?: { hasNextPage?: boolean; endCursor?: string } };
    };
    collected.push(...rows(json, kind));
    const pageInfo = json.pageInfo ?? json.data?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    cursor = pageInfo.endCursor;
  }
  return collected;
}

function describe(action: SetupAction): string {
  if (action.kind === "warning") return `WARNING ${action.message}`;
  if (action.kind === "create_object") return `CREATE OBJECT ${action.nameSingular}`;
  if (action.kind === "create_field") return `CREATE FIELD ${action.object}.${action.name} (${action.type})`;
  return `CREATE RELATION ${action.object}.${action.name} → ${action.targetObject}`;
}

async function main() {
  console.log(`${apply ? "APPLY" : "DRY RUN"} against ${root}`);
  console.log("Dry run still reads metadata. Only --apply writes. Nothing here runs unless you execute this script.");
  const [objectRows, fieldRows] = await Promise.all([listAll("objects"), listAll("fields")]);
  const objects: MetadataObject[] = objectRows.map((object) => {
    const id = String(object.id);
    const embedded = Array.isArray(object.fields) ? (object.fields as Record<string, unknown>[]) : [];
    const related = fieldRows.filter((field) => field.objectMetadataId === id);
    const fields = (embedded.length > 0 ? embedded : related).map((field) => ({
      name: String(field.name),
      type: String(field.type ?? ""),
    }));
    return { id, nameSingular: String(object.nameSingular), fields };
  });
  const actions = planTwentySetup(objects, { nextFollowUpField: followUpField, createMissingFollowUp: withFollowUp });
  if (actions.length === 0) {
    console.log("Twenty already has the dialer fields. Nothing to change.");
    return;
  }
  for (const action of actions) console.log(describe(action));
  if (!apply) {
    console.log("\nRe-run with --apply to make these changes. Add --with-next-follow-up only if that opportunity field should be created.");
    return;
  }

  const ids = new Map(objects.map((object) => [object.nameSingular, object.id]));
  for (const action of actions) {
    if (action.kind === "warning") continue;
    if (action.kind === "create_object") {
      const json = await twenty("/rest/metadata/objects", {
        method: "POST",
        body: JSON.stringify({
          nameSingular: action.nameSingular,
          namePlural: action.namePlural,
          labelSingular: action.labelSingular,
          labelPlural: action.labelPlural,
          description: action.description,
          icon: action.icon,
        }),
      });
      const id = readCreatedId(json, "object") ?? readCreatedId(json, "createObject");
      if (!id) throw new Error("Twenty did not return the new Call object id");
      ids.set(action.nameSingular, id);
      console.log(`Created object ${id}`);
      continue;
    }
    const objectMetadataId = ids.get(action.object);
    if (!objectMetadataId) throw new Error(`No metadata id for ${action.object}`);
    if (action.kind === "create_relation") {
      await twenty("/rest/metadata/fields", {
        method: "POST",
        body: JSON.stringify({
          objectMetadataId,
          type: "RELATION",
          name: action.name,
          label: action.label,
          relationCreationPayload: {
            type: "MANY_TO_ONE",
            targetObjectMetadataId: ids.get(action.targetObject),
            targetFieldLabel: action.targetFieldLabel,
            targetFieldIcon: "IconPhone",
          },
        }),
      });
      continue;
    }
    const payload: Record<string, unknown> = {
      objectMetadataId,
      type: action.type,
      name: action.name,
      label: action.label,
    };
    if (action.options) payload.options = action.options;
    if (action.isUnique) payload.isUnique = true;
    try {
      await twenty("/rest/metadata/fields", { method: "POST", body: JSON.stringify(payload) });
    } catch (error) {
      if (!action.isUnique) throw error;
      delete payload.isUnique;
      await twenty("/rest/metadata/fields", { method: "POST", body: JSON.stringify(payload) });
      console.log(`Created ${action.name} without a unique index. The API rejected isUnique.`);
    }
  }
  console.log("Twenty setup applied.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
