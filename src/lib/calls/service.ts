import type { Call, CallerIdNumber, User } from "@prisma/client";
import { decideDial, refusal, type DialDecision, type PartyInput } from "@/lib/compliance/decide";
import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import { liveCallBlock, normalizeDisposition } from "@/lib/dispositions";
import { toE164 } from "@/lib/phone";
import { applyClientEvent, type CallSnapshot, type ClientCallEvent } from "@/lib/telephony/events";
import { getTwentyClient } from "@/lib/twenty";
import { syncCallToTwenty, type SyncableCall } from "@/lib/twenty/sync";
import { pickOpenOpportunity, type TwentyCompany, type TwentyOpportunity, type TwentyPerson } from "@/lib/twenty/types";

export type CallContext = {
  person: TwentyPerson | null;
  company: TwentyCompany | null;
  opportunity: TwentyOpportunity | null;
  twentyError: string | null;
};

function partyFromPerson(person: TwentyPerson | null): PartyInput | null {
  if (!person) return null;
  return {
    id: person.id,
    name: person.name,
    phones: person.phones,
    primaryPhone: person.primaryPhone,
    state: person.state,
    dnc: person.dnc,
  };
}

function partyFromCompany(company: TwentyCompany | null): PartyInput | null {
  if (!company) return null;
  return {
    id: company.id,
    name: company.name,
    phones: company.phones,
    primaryPhone: company.primaryPhone,
    state: company.state,
    dnc: company.dnc,
  };
}

export async function loadCallContext(input: {
  personId?: string | null;
  companyId?: string | null;
  opportunityId?: string | null;
  phone?: string | null;
}): Promise<CallContext> {
  const twenty = getTwentyClient();
  try {
    let person = input.personId ? await twenty.getPerson(input.personId) : null;
    let company = input.companyId ? await twenty.getCompany(input.companyId) : null;
    let opportunity = input.opportunityId ? await twenty.getOpportunity(input.opportunityId) : null;
    if (!person && input.phone) {
      const matches = await twenty.findPeopleByPhone(toE164(input.phone) ?? input.phone);
      if (matches.length === 1) person = matches[0];
    }
    if (opportunity && !company && opportunity.companyId) company = await twenty.getCompany(opportunity.companyId);
    if (opportunity && !person && opportunity.pointOfContactId) person = await twenty.getPerson(opportunity.pointOfContactId);
    if (person && !company && person.companyId) company = await twenty.getCompany(person.companyId);
    if (!opportunity && (person || company)) {
      const opportunities = await twenty.listOpportunitiesFor({
        personId: person?.id,
        companyId: company?.id ?? person?.companyId,
      });
      opportunity = pickOpenOpportunity(opportunities);
    }
    return { person, company, opportunity, twentyError: null };
  } catch (error) {
    return {
      person: null,
      company: null,
      opportunity: null,
      twentyError: error instanceof Error ? error.message : "Twenty request failed",
    };
  }
}

function toSyncable(call: Call): SyncableCall {
  return {
    id: call.id,
    status: call.status,
    direction: call.direction,
    fromNumber: call.fromNumber,
    toNumber: call.toNumber,
    repName: call.repName,
    repEmail: call.repEmail,
    prospectName: call.prospectName,
    companyName: call.companyName,
    personId: call.personId,
    companyId: call.companyId,
    opportunityId: call.opportunityId,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    durationSeconds: call.durationSeconds,
    disposition: call.disposition,
    notes: call.notes,
    recordingUrl: call.recordingUrl,
    disclosurePlayed: call.disclosurePlayed,
    prospectTimezone: call.prospectTimezone,
    complianceSummary: call.complianceSummary,
    twentyCallId: call.twentyCallId,
  };
}

export function toSnapshot(call: Call): CallSnapshot {
  return {
    id: call.id,
    status: call.status,
    fromNumber: call.fromNumber,
    toNumber: call.toNumber,
    startedAt: call.startedAt?.toISOString() ?? null,
    answeredAt: call.answeredAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    durationSeconds: call.durationSeconds,
    recordingUrl: call.recordingUrl,
    recordingStatus: call.recordingStatus,
    recordingMode: call.recordingMode,
    disclosureRequired: call.disclosureRequired,
    disclosurePlayed: call.disclosurePlayed,
    telnyxCallControlId: call.telnyxCallControlId,
    telnyxCallSessionId: call.telnyxCallSessionId,
    hangupCause: call.hangupCause,
    providerError: call.providerError,
    updatedAt: call.updatedAt.toISOString(),
  };
}

export async function prepareCall(input: {
  user: User;
  personId?: string | null;
  companyId?: string | null;
  opportunityId?: string | null;
  phone?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const config = getConfig();
  const context = await loadCallContext(input);
  if (context.twentyError) {
    const decision = refusal(
      `Could not verify do-not-call status with Twenty (${context.twentyError}). Dialing is paused until the CRM responds.`,
    );
    const blocked = await prisma.call.create({
      data: callData(input.user, input, decision, context),
    });
    return { call: blocked, decision, context };
  }

  const person = partyFromPerson(context.person);
  const company = partyFromCompany(context.company);

  const live = await prisma.call.findMany({
    where: { repId: input.user.id, status: { in: ["DIALING", "RINGING", "IN_PROGRESS", "ON_HOLD"] } },
    select: { status: true, updatedAt: true },
  });
  const liveBlock = liveCallBlock(live, now);
  const pool = await prisma.callerIdNumber.findMany({ where: { active: true } });
  const decision = decideDial({
    now,
    requestedPhone: input.phone,
    person,
    company,
    dncEntries: await lookupDnc(input.phone, person, company),
    pool: pool.map(toPool),
    settings: config.dial,
    linkedToTwenty: Boolean(context.person || context.company),
  });
  if (liveBlock) {
    decision.blocks.unshift(liveBlock);
    decision.allowed = false;
  }
  const call = await prisma.call.create({
    data: callData(input.user, input, decision, context),
  });
  return { call, decision, context };
}

export async function previewDial(input: {
  personId?: string | null;
  companyId?: string | null;
  opportunityId?: string | null;
  phone?: string | null;
  now?: Date;
}): Promise<{ context: CallContext; decision: DialDecision }> {
  const now = input.now ?? new Date();
  const config = getConfig();
  const context = await loadCallContext(input);
  if (context.twentyError) {
    return {
      context,
      decision: refusal(
        `Could not verify do-not-call status with Twenty (${context.twentyError}). Dialing is paused until the CRM responds.`,
      ),
    };
  }
  const person = partyFromPerson(context.person);
  const company = partyFromCompany(context.company);
  const pool = await prisma.callerIdNumber.findMany({ where: { active: true } });
  const decision = decideDial({
    now,
    requestedPhone: input.phone,
    person,
    company,
    dncEntries: await lookupDnc(input.phone, person, company),
    pool: pool.map(toPool),
    settings: config.dial,
    linkedToTwenty: Boolean(context.person || context.company),
  });
  return { context, decision };
}

function callData(
  user: User,
  input: { phone?: string | null; personId?: string | null; companyId?: string | null; opportunityId?: string | null },
  decision: DialDecision,
  context: CallContext,
) {
  return {
    repId: user.id,
    repName: user.name,
    repEmail: user.email,
    direction: "OUTBOUND" as const,
    fromNumber: decision.callerId?.e164 ?? null,
    toNumber: decision.e164 ?? input.phone?.trim() ?? "unknown",
    personId: context.person?.id ?? input.personId ?? null,
    companyId: context.company?.id ?? context.person?.companyId ?? input.companyId ?? null,
    opportunityId: context.opportunity?.id ?? input.opportunityId ?? null,
    prospectName: context.person?.name ?? null,
    companyName: context.company?.name ?? context.person?.companyName ?? null,
    prospectState: decision.prospectState,
    prospectTimezone: decision.timeZones[0] ?? null,
    areaCode: decision.areaCode,
    localTimeLabel: decision.localTimeLabel,
    complianceSummary: decision.complianceSummary,
    status: decision.allowed ? "READY" : "BLOCKED",
    blockReason: decision.allowed ? null : decision.blocks.join(" "),
    warnings: decision.warnings.join("\n") || null,
    recordingStatus: decision.recording.mode === "skip" ? "SKIPPED" : "PENDING",
    recordingMode: decision.recording.mode,
    disclosureRequired: decision.recording.disclosureRequired,
    callerIdReason: decision.callerId?.reason ?? null,
    twentySyncStatus: decision.allowed ? "PENDING" : "SKIPPED",
  };
}

async function lookupDnc(phone: string | null | undefined, person: PartyInput | null, company: PartyInput | null) {
  const candidates = [phone, person?.primaryPhone, ...(person?.phones ?? []), company?.primaryPhone, ...(company?.phones ?? [])]
    .map((value) => (value ? toE164(value) : null))
    .filter((value): value is string => Boolean(value));
  if (candidates.length === 0) return [];
  return prisma.dncEntry.findMany({ where: { e164: { in: candidates } } });
}

function toPool(number: CallerIdNumber) {
  return {
    e164: number.e164,
    areaCode: number.areaCode,
    state: number.state,
    isDefault: number.isDefault,
    active: number.active,
    demo: number.demo,
    label: number.label,
  };
}

export async function applyBrowserEvent(call: Call, type: ClientCallEvent, now = new Date()): Promise<Call> {
  const config = getConfig();
  const snapshot = applyClientEvent(toSnapshot(call), type, now.toISOString(), {
    allowBrowserDisclosure: config.telephonyMode === "mock",
  });
  return prisma.call.update({
    where: { id: call.id },
    data: {
      status: snapshot.status,
      startedAt: snapshot.startedAt ? new Date(snapshot.startedAt) : null,
      answeredAt: snapshot.answeredAt ? new Date(snapshot.answeredAt) : null,
      endedAt: snapshot.endedAt ? new Date(snapshot.endedAt) : null,
      durationSeconds: snapshot.durationSeconds,
      disclosurePlayed: snapshot.disclosurePlayed,
      updatedAt: now,
    },
  });
}

export async function saveDisposition(input: {
  call: Call;
  disposition: string;
  notes?: string | null;
  nextFollowUp?: string | null;
  addToDnc?: boolean;
  actor: User;
}) {
  const disposition = normalizeDisposition(input.disposition);
  if (!disposition) throw new Error("Pick a disposition: connected, voicemail, no answer, bad number, meeting booked, or not interested.");
  if (input.call.status === "BLOCKED") throw new Error("Blocked attempts are not logged to Twenty.");
  const followUp = input.nextFollowUp?.trim() ? input.nextFollowUp.trim() : null;
  if (followUp && !/^\d{4}-\d{2}-\d{2}$/.test(followUp)) throw new Error("Next follow-up must be a YYYY-MM-DD date.");

  let call = await prisma.call.update({
    where: { id: input.call.id },
    data: {
      disposition,
      notes: input.notes?.trim() || null,
      nextFollowUp: followUp ? new Date(`${followUp}T00:00:00.000Z`) : input.call.nextFollowUp,
      status: input.call.status === "READY" || input.call.status === "DIALING" || input.call.status === "RINGING" ? "ENDED" : input.call.status,
      endedAt: input.call.endedAt ?? new Date(),
    },
  });

  if (input.addToDnc && call.toNumber) {
    await prisma.dncEntry.upsert({
      where: { e164: call.toNumber },
      update: { reason: input.notes?.trim() || `Marked ${disposition} by ${input.actor.email}`, source: "INTERNAL" },
      create: {
        e164: call.toNumber,
        reason: input.notes?.trim() || `Marked ${disposition} by ${input.actor.email}`,
        source: "INTERNAL",
        createdBy: input.actor.email,
      },
    });
    try {
      await getTwentyClient().setDoNotCall({ personId: call.personId, companyId: call.companyId });
    } catch (error) {
      call = await prisma.call.update({
        where: { id: call.id },
        data: {
          warnings: [call.warnings, `Internal DNC saved. Twenty do-not-call update failed: ${error instanceof Error ? error.message : "unknown error"}`]
            .filter(Boolean)
            .join("\n"),
        },
      });
    }
  }

  const config = getConfig();
  const result = await syncCallToTwenty(getTwentyClient(), toSyncable(call), {
    mirrorNote: config.twentyMirrorNotes,
    nextFollowUp: followUp,
  });
  call = await prisma.call.update({
    where: { id: call.id },
    data: {
      twentyCallId: result.twentyCallId,
      twentyNoteId: result.twentyNoteId ?? call.twentyNoteId,
      twentySyncStatus: result.status === "synced" ? "SYNCED" : result.status === "error" ? "ERROR" : "SKIPPED",
      twentySyncError: result.error ?? (result.warnings.length ? result.warnings.join(" ") : null),
    },
  });
  return { call, result };
}
