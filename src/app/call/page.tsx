import { notFound } from "next/navigation";
import { LocalClock } from "@/components/LocalClock";
import { Softphone } from "@/components/Softphone";
import { previewDial } from "@/lib/calls/service";
import { getConfig } from "@/lib/config";
import { stateName } from "@/lib/compliance/geography";
import { prisma } from "@/lib/db";
import { formatPhone } from "@/lib/phone";
import { requireUser } from "@/lib/session";
import type { TwentyCompany, TwentyOpportunity, TwentyPerson } from "@/lib/twenty/types";

export const dynamic = "force-dynamic";

function one(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function CallPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const callId = one(params.callId);
  const existing = callId ? await prisma.call.findUnique({ where: { id: callId } }) : null;
  if (callId && (!existing || (existing.repId !== user.id && user.role !== "ADMIN"))) notFound();

  const personId = existing?.personId ?? one(params.personId);
  const companyId = existing?.companyId ?? one(params.companyId);
  const opportunityId = existing?.opportunityId ?? one(params.opportunityId);
  const phone = existing?.toNumber && existing.toNumber !== "unknown" ? existing.toNumber : one(params.phone);
  const preview = await previewDial({ personId, companyId, opportunityId, phone });
  const config = getConfig();
  const { person, company, opportunity } = preview.context;
  const decision = preview.decision;

  return (
    <main className="grid">
      <section className="card stack">
        <Prospect person={person} company={company} opportunity={opportunity} twentyAppUrl={config.twentyAppUrl} />
        <LocalClock timeZones={decision.timeZones} startMinutes={config.dial.windowStartMinutes} endMinutes={config.dial.windowEndMinutes} />
        <div className="row">
          <span>Number</span>
          <strong>{decision.e164 ? formatPhone(decision.e164) : "—"}</strong>
        </div>
        <div className="row">
          <span>Caller ID</span>
          <strong>{decision.callerId ? formatPhone(decision.callerId.e164) : "None"}</strong>
        </div>
        <p className="muted">{decision.callerId?.reason}</p>
        <div className="row">
          <span>Where</span>
          <strong>
            {decision.prospectState ? `${stateName(decision.prospectState)} (${decision.prospectState})` : "Unknown"}
            {decision.areaCode ? ` · ${decision.areaCode}` : ""}
          </strong>
        </div>
        <div className="row">
          <span>Time zone</span>
          <strong>{decision.timeZones.join(", ") || "Unknown"}</strong>
        </div>
        {opportunity ? (
          <div className="row">
            <span>Opportunity</span>
            <strong>
              {opportunity.name} · {opportunity.stage ?? "No stage"}
              {opportunity.nextFollowUp ? ` · follow up ${opportunity.nextFollowUp.slice(0, 10)}` : ""}
            </strong>
          </div>
        ) : null}
        {decision.blocks.map((block) => (
          <div className="banner bad" key={block}>
            {block}
          </div>
        ))}
        {decision.warnings.map((warning) => (
          <div className="banner warn" key={warning}>
            {warning}
          </div>
        ))}
        {person && person.phones.length > 1 ? (
          <div className="stack">
            <span>Other numbers on this person</span>
            {person.phones.map((number) => (
              <a key={number} href={`/call?personId=${person.id}&phone=${encodeURIComponent(number)}`}>
                {formatPhone(number)}
              </a>
            ))}
          </div>
        ) : null}
      </section>
      <Softphone
        personId={person?.id ?? personId}
        companyId={company?.id ?? companyId}
        opportunityId={opportunity?.id ?? opportunityId}
        phone={phone}
        telephonyMode={config.telephonyMode}
        suggestedDisposition={existing?.disposition ?? (existing?.answeredAt ? "CONNECTED" : existing?.status === "ENDED" ? "NO_ANSWER" : null)}
        initialCall={existing ? { id: existing.id, status: existing.status, disposition: existing.disposition } : null}
        preview={{
          allowed: decision.allowed,
          blocks: decision.blocks,
          warnings: decision.warnings,
          to: decision.e164,
          from: decision.callerId?.e164 ?? null,
          callerIdReason: decision.callerId?.reason ?? null,
          recordingMode: decision.recording.mode,
          disclosureRequired: decision.recording.disclosureRequired,
          disclosureText: decision.recording.disclosureText,
          timeZones: decision.timeZones,
          windowStart: config.dial.windowStartMinutes,
          windowEnd: config.dial.windowEndMinutes,
        }}
      />
    </main>
  );
}

function Prospect({
  person,
  company,
  opportunity,
  twentyAppUrl,
}: {
  person: TwentyPerson | null;
  company: TwentyCompany | null;
  opportunity: TwentyOpportunity | null;
  twentyAppUrl: string;
}) {
  const title = person?.name || company?.name || opportunity?.name || "Ad hoc number";
  return (
    <div>
      <h1>{title}</h1>
      <p className="muted">
        {company?.name && person ? company.name : "Not linked to a company"}
        {person?.city ? ` · ${person.city}` : company?.city ? ` · ${company.city}` : ""}
      </p>
      <div className="stack">
        {person ? <a href={`${twentyAppUrl}/objects/people/${person.id}`}>Open person in Twenty</a> : null}
        {company ? <a href={`${twentyAppUrl}/objects/companies/${company.id}`}>Open company in Twenty</a> : null}
        {opportunity ? <a href={`${twentyAppUrl}/objects/opportunities/${opportunity.id}`}>Open opportunity in Twenty</a> : null}
      </div>
    </div>
  );
}
