import { dispositionLabel } from "@/lib/dispositions";
import { formatPhone } from "@/lib/phone";
import { compactRecord } from "@/lib/twenty/map";
import type { TwentyCallWrite, TwentyClient } from "@/lib/twenty/types";

export type SyncableCall = {
  id: string;
  status: string;
  direction: string;
  fromNumber: string | null;
  toNumber: string;
  repName: string | null;
  repEmail: string | null;
  prospectName: string | null;
  companyName: string | null;
  personId: string | null;
  companyId: string | null;
  opportunityId: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number | null;
  disposition: string | null;
  notes: string | null;
  recordingUrl: string | null;
  disclosurePlayed: boolean;
  prospectTimezone: string | null;
  complianceSummary: string | null;
  twentyCallId: string | null;
  twentyNoteId?: string | null;
};

export type SyncResult = {
  status: "synced" | "skipped" | "error";
  twentyCallId: string | null;
  twentyNoteId: string | null;
  error: string | null;
  warnings: string[];
};

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export function toTwentyCallWrite(call: SyncableCall): TwentyCallWrite {
  const who = call.prospectName || call.companyName || formatPhone(call.toNumber);
  const outcome = call.disposition ? dispositionLabel(call.disposition) : "Unlogged";
  return {
    name: `${call.direction === "INBOUND" ? "Inbound" : "Outbound"} · ${who} · ${outcome}`.slice(0, 180),
    direction: call.direction === "INBOUND" ? "INBOUND" : "OUTBOUND",
    fromNumber: call.fromNumber,
    toNumber: call.toNumber,
    repName: call.repName,
    repEmail: call.repEmail,
    startedAt: iso(call.startedAt),
    endedAt: iso(call.endedAt),
    durationSeconds: call.durationSeconds,
    disposition: call.disposition,
    notes: call.notes,
    recordingUrl: call.recordingUrl,
    disclosurePlayed: call.disclosurePlayed,
    prospectTimezone: call.prospectTimezone,
    dialerCallId: call.id,
    personId: call.personId,
    companyId: call.companyId,
    opportunityId: call.opportunityId,
  };
}

export function buildCallNote(call: SyncableCall): { title: string; markdown: string } {
  const outcome = call.disposition ? dispositionLabel(call.disposition) : "No disposition";
  const who = call.prospectName || "Unknown prospect";
  const minutes = call.durationSeconds == null ? "—" : formatDuration(call.durationSeconds);
  const lines = [
    `${call.direction === "INBOUND" ? "Inbound" : "Outbound"} call with ${who}${call.companyName ? ` (${call.companyName})` : ""}.`,
    "",
    `- Rep: ${call.repName ?? "Unknown"}${call.repEmail ? ` (${call.repEmail})` : ""}`,
    `- From: ${call.fromNumber ? formatPhone(call.fromNumber) : "—"}`,
    `- To: ${formatPhone(call.toNumber)}`,
    `- Disposition: ${outcome}`,
    `- Talk time: ${minutes}`,
    `- Recording: ${call.recordingUrl ?? "none"}`,
    `- Recording notice played: ${call.disclosurePlayed ? "yes" : "no"}`,
    call.complianceSummary ? `- Compliance: ${call.complianceSummary}` : null,
    call.notes ? "" : null,
    call.notes ? call.notes : null,
  ].filter((line): line is string => line !== null);
  return {
    title: `Call · ${outcome} · ${who}`.slice(0, 180),
    markdown: lines.join("\n"),
  };
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export async function syncCallToTwenty(
  client: Pick<
    TwentyClient,
    "findCallByDialerId" | "createCall" | "updateCall" | "createTimelineNote" | "updateOpportunityFollowUp"
  >,
  call: SyncableCall,
  options: { mirrorNote?: boolean; nextFollowUp?: string | null } = {},
): Promise<SyncResult> {
  if (call.status === "BLOCKED") {
    return {
      status: "skipped",
      twentyCallId: null,
      twentyNoteId: null,
      error: null,
      warnings: ["Blocked attempts stay in the dialer log and are not written to Twenty."],
    };
  }
  if (!call.disposition) {
    return {
      status: "skipped",
      twentyCallId: call.twentyCallId,
      twentyNoteId: null,
      error: null,
      warnings: ["Pick a disposition before logging the call to Twenty."],
    };
  }

  const warnings: string[] = [];
  const payload = compactRecord(toTwentyCallWrite(call) as unknown as Record<string, unknown>) as TwentyCallWrite;
  try {
    let twentyCallId = call.twentyCallId;
    if (!twentyCallId) {
      const existing = await client.findCallByDialerId(call.id);
      twentyCallId = existing?.id ?? null;
    }
    if (twentyCallId) {
      await client.updateCall(twentyCallId, payload);
    } else {
      const created = await client.createCall(payload);
      twentyCallId = created.id;
    }

    let twentyNoteId: string | null = call.twentyNoteId ?? null;
    if (options.mirrorNote !== false && !twentyNoteId) {
      try {
        const note = buildCallNote(call);
        const createdNote = await client.createTimelineNote({
          ...note,
          personId: call.personId,
          companyId: call.companyId,
          opportunityId: call.opportunityId,
        });
        twentyNoteId = createdNote.id;
      } catch (error) {
        warnings.push(`Call saved. Timeline note failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }

    if (options.nextFollowUp && call.opportunityId) {
      try {
        await client.updateOpportunityFollowUp(call.opportunityId, options.nextFollowUp);
      } catch (error) {
        warnings.push(
          `Call saved. Next follow-up was not written: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }

    return { status: "synced", twentyCallId, twentyNoteId, error: null, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Twenty sync failed";
    return { status: "error", twentyCallId: call.twentyCallId, twentyNoteId: null, error: message, warnings };
  }
}
