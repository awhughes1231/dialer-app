import { SearchPanel } from "@/components/SearchPanel";
import { formatDuration } from "@/lib/twenty/sync";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { endCallAction } from "@/app/actions";
import { dispositionLabel, isStaleLiveCall, LIVE_CALL_STATUSES } from "@/lib/dispositions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const calls = await prisma.call.findMany({
    where: { repId: user.id },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const now = new Date();
  return (
    <main className="grid">
      <section>
        <h1>Who are you calling?</h1>
        <p className="muted">Search Twenty, or open a person from the Call button inside the CRM. The browser places the call. Twenty keeps the record.</p>
        <div className="card">
          <SearchPanel />
        </div>
      </section>
      <section className="card">
        <h2>Your recent calls</h2>
        {calls.length === 0 ? <p className="muted">No calls yet. Try Jordan Lee in the mock CRM, or Sam Patel in New York.</p> : null}
        {calls.map((call) => {
          const live = LIVE_CALL_STATUSES.includes(call.status as (typeof LIVE_CALL_STATUSES)[number]);
          const stale = isStaleLiveCall(call.status, call.updatedAt, now);
          return (
            <div className="row" key={call.id}>
              <div>
                <strong>{call.prospectName || call.toNumber}</strong>
                <div className="muted">
                  {call.status}
                  {call.disposition ? ` · ${dispositionLabel(call.disposition)}` : ""}
                  {call.durationSeconds != null ? ` · ${formatDuration(call.durationSeconds)}` : ""}
                  {call.blockReason ? ` · ${call.blockReason}` : ""}
                </div>
              </div>
              <div className="stack">
                {call.status !== "BLOCKED" ? <a href={`/call?callId=${call.id}`}>Open</a> : null}
                {live || stale ? (
                  <form action={endCallAction}>
                    <input type="hidden" name="id" value={call.id} />
                    <button className="secondary" type="submit">
                      End stuck call
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
