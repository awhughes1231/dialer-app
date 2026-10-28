import { prisma } from "@/lib/db";
import { getConfig, TELNYX_WEBHOOK_PATH } from "@/lib/config";
import { dispositionLabel } from "@/lib/dispositions";
import { formatPhone } from "@/lib/phone";
import { requireAdmin } from "@/lib/session";
import { formatDuration } from "@/lib/twenty/sync";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const repId = typeof params.rep === "string" ? params.rep : "";
  const reps = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const calls = await prisma.call.findMany({
    where: repId ? { repId } : undefined,
    include: { rep: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const config = getConfig();
  return (
    <main className="stack">
      <h1>Call log</h1>
      <section className="card">
        <h2>Integration</h2>
        <div className="row"><span>Telephony</span><strong>{config.telephonyMode}</strong></div>
        <div className="row"><span>Twenty</span><strong>{config.twentyMode}</strong></div>
        <div className="row"><span>Twenty API key</span><strong>{config.twentyApiKey ? "present" : "missing"}</strong></div>
        <div className="row"><span>Telnyx API key</span><strong>{config.telnyxApiKey ? "present" : "missing"}</strong></div>
        <div className="row"><span>Telnyx public key</span><strong>{config.telnyxPublicKey ? "present" : "missing"}</strong></div>
        <div className="row"><span>Connection id</span><strong>{config.telnyxConnectionId ? `…${config.telnyxConnectionId.slice(-4)}` : "missing"}</strong></div>
        <div className="row"><span>Outbound voice profile</span><strong>{config.telnyxOutboundVoiceProfileId ? "present" : "missing"}</strong></div>
        <div className="row"><span>Webhook</span><strong>{config.publicAppUrl}{TELNYX_WEBHOOK_PATH}</strong></div>
        <div className="row"><span>Two-party recording</span><strong>{config.dial.twoPartyMode}</strong></div>
        <div className="row"><span>All-party states</span><strong>{[...config.dial.allPartyStates].sort().join(", ")}</strong></div>
      </section>
      <form className="card" method="get">
        <label>
          Rep
          <select name="rep" defaultValue={repId}>
            <option value="">Everyone</option>
            {reps.map((rep) => (
              <option key={rep.id} value={rep.id}>
                {rep.name} ({rep.role})
              </option>
            ))}
          </select>
        </label>
        <button className="secondary" type="submit">Filter</button>
      </form>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Rep</th>
              <th>Prospect</th>
              <th>From</th>
              <th>To</th>
              <th>Duration</th>
              <th>Disposition</th>
              <th>Twenty</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <tr key={call.id}>
                <td>{call.createdAt.toISOString().replace("T", " ").slice(0, 16)}</td>
                <td>{call.rep?.name ?? call.repName ?? "—"}</td>
                <td>
                  {call.prospectName ?? "—"}
                  {call.blockReason ? <div className="muted">{call.blockReason}</div> : null}
                </td>
                <td>{call.fromNumber ? formatPhone(call.fromNumber) : "—"}</td>
                <td>{formatPhone(call.toNumber)}</td>
                <td>{call.durationSeconds != null ? formatDuration(call.durationSeconds) : call.status}</td>
                <td>
                  {dispositionLabel(call.disposition)}
                  {call.recordingUrl ? (
                    <div>
                      <a href={call.recordingUrl}>Recording</a>
                    </div>
                  ) : (
                    <div className="muted">{call.recordingStatus}</div>
                  )}
                </td>
                <td>{call.twentySyncStatus}{call.twentySyncError ? <div className="muted">{call.twentySyncError}</div> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
