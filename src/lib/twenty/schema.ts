export type MetadataField = {
  name: string;
  type: string;
};

export type MetadataObject = {
  id: string;
  nameSingular: string;
  fields: MetadataField[];
};

export type SetupAction =
  | {
      kind: "create_object";
      nameSingular: string;
      namePlural: string;
      labelSingular: string;
      labelPlural: string;
      description: string;
      icon: string;
    }
  | {
      kind: "create_field";
      object: string;
      name: string;
      label: string;
      type: "TEXT" | "NUMBER" | "BOOLEAN" | "DATE_TIME" | "SELECT";
      isUnique?: boolean;
      options?: { label: string; value: string; color: string; position: number }[];
    }
  | {
      kind: "create_relation";
      object: string;
      name: string;
      label: string;
      targetObject: string;
      targetFieldLabel: string;
    }
  | { kind: "warning"; message: string };

const DISPOSITION_OPTIONS = [
  ["CONNECTED", "Connected", "green"],
  ["VOICEMAIL", "Voicemail", "sky"],
  ["NO_ANSWER", "No answer", "gray"],
  ["BAD_NUMBER", "Bad number", "red"],
  ["MEETING_BOOKED", "Meeting booked", "turquoise"],
  ["NOT_INTERESTED", "Not interested", "orange"],
] as const;

const DIRECTION_OPTIONS = [
  ["OUTBOUND", "Outbound", "blue"],
  ["INBOUND", "Inbound", "purple"],
] as const;

function selectOptions(rows: readonly (readonly [string, string, string])[]) {
  return rows.map(([value, label, color], position) => ({ value, label, color, position }));
}

const CALL_FIELDS: SetupAction[] = [
  { kind: "create_field", object: "call", name: "direction", label: "Direction", type: "SELECT", options: selectOptions(DIRECTION_OPTIONS) },
  { kind: "create_field", object: "call", name: "fromNumber", label: "From", type: "TEXT" },
  { kind: "create_field", object: "call", name: "toNumber", label: "To", type: "TEXT" },
  { kind: "create_field", object: "call", name: "repName", label: "Rep name", type: "TEXT" },
  { kind: "create_field", object: "call", name: "repEmail", label: "Rep email", type: "TEXT" },
  { kind: "create_field", object: "call", name: "startedAt", label: "Started at", type: "DATE_TIME" },
  { kind: "create_field", object: "call", name: "endedAt", label: "Ended at", type: "DATE_TIME" },
  { kind: "create_field", object: "call", name: "durationSeconds", label: "Duration (seconds)", type: "NUMBER" },
  { kind: "create_field", object: "call", name: "disposition", label: "Disposition", type: "SELECT", options: selectOptions(DISPOSITION_OPTIONS) },
  { kind: "create_field", object: "call", name: "notes", label: "Notes", type: "TEXT" },
  { kind: "create_field", object: "call", name: "recordingUrl", label: "Recording URL", type: "TEXT" },
  { kind: "create_field", object: "call", name: "disclosurePlayed", label: "Disclosure played", type: "BOOLEAN" },
  { kind: "create_field", object: "call", name: "prospectTimezone", label: "Prospect time zone", type: "TEXT" },
  { kind: "create_field", object: "call", name: "dialerCallId", label: "Dialer call ID", type: "TEXT", isUnique: true },
  { kind: "create_relation", object: "call", name: "person", label: "Person", targetObject: "person", targetFieldLabel: "Calls" },
  { kind: "create_relation", object: "call", name: "company", label: "Company", targetObject: "company", targetFieldLabel: "Calls" },
  { kind: "create_relation", object: "call", name: "opportunity", label: "Opportunity", targetObject: "opportunity", targetFieldLabel: "Calls" },
];

function hasField(object: MetadataObject | undefined, name: string): boolean {
  return Boolean(object?.fields.some((field) => field.name === name));
}

export function planTwentySetup(
  objects: MetadataObject[],
  options: { nextFollowUpField?: string; createMissingFollowUp?: boolean } = {},
): SetupAction[] {
  const followUpField = options.nextFollowUpField ?? "nextFollowUp";
  const byName = new Map(objects.map((object) => [object.nameSingular, object]));
  const actions: SetupAction[] = [];
  const person = byName.get("person");
  const company = byName.get("company");
  const opportunity = byName.get("opportunity");
  let call = byName.get("call");

  if (!person) actions.push({ kind: "warning", message: "Standard object person was not returned by the metadata API." });
  if (!company) actions.push({ kind: "warning", message: "Standard object company was not returned by the metadata API." });
  if (!opportunity) actions.push({ kind: "warning", message: "Standard object opportunity was not returned by the metadata API." });

  if (!call) {
    actions.push({
      kind: "create_object",
      nameSingular: "call",
      namePlural: "calls",
      labelSingular: "Call",
      labelPlural: "Calls",
      description: "Phone calls logged by the E-Commerce Wala dialer",
      icon: "IconPhone",
    });
    actions.push(...CALL_FIELDS);
  } else {
    for (const field of CALL_FIELDS) {
      if (field.kind === "create_field" && !hasField(call, field.name)) actions.push(field);
      if (field.kind === "create_relation" && !hasField(call, field.name)) actions.push(field);
    }
  }

  if (person && !hasField(person, "doNotCall")) {
    actions.push({
      kind: "create_field",
      object: "person",
      name: "doNotCall",
      label: "Do not call",
      type: "BOOLEAN",
    });
  }
  if (company && !hasField(company, "doNotCall")) {
    actions.push({
      kind: "create_field",
      object: "company",
      name: "doNotCall",
      label: "Do not call",
      type: "BOOLEAN",
    });
  }

  if (opportunity && !hasField(opportunity, followUpField)) {
    if (options.createMissingFollowUp) {
      actions.push({
        kind: "create_field",
        object: "opportunity",
        name: followUpField,
        label: "Next follow-up",
        type: "DATE_TIME",
      });
    } else {
      actions.push({
        kind: "warning",
        message: `Opportunity field ${followUpField} was not found. The dialer will not write follow-up dates until it exists. Re-run with --with-next-follow-up to create it, or set TWENTY_NEXT_FOLLOW_UP_FIELD if the field uses another name.`,
      });
    }
  }

  if (actions.every((action) => action.kind === "warning") || actions.length === 0) {
    // A fully provisioned workspace still returns warnings only when something is missing.
  }
  return actions;
}
