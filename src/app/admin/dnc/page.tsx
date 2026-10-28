import { addDncAction, removeDncAction } from "@/app/admin/actions";
import { prisma } from "@/lib/db";
import { formatPhone } from "@/lib/phone";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DncPage() {
  await requireAdmin();
  const entries = await prisma.dncEntry.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <main className="stack">
      <h1>Internal do-not-call list</h1>
      <p className="muted">A number on this list cannot be dialed, even if Twenty has no do-not-call flag. Twenty&apos;s person and company flags are checked as well.</p>
      <form className="card stack" action={addDncAction}>
        <label>Number<input name="phone" required /></label>
        <label>Reason<input name="reason" required placeholder="Asked not to be called" /></label>
        <button className="primary" type="submit">Add to DNC</button>
      </form>
      <div className="card">
        {entries.map((entry) => (
          <div className="row" key={entry.id}>
            <div>
              <strong>{formatPhone(entry.e164)}</strong>
              <div className="muted">{entry.reason} · {entry.source}{entry.demo ? " · DEMO" : ""}</div>
            </div>
            <form action={removeDncAction}>
              <input type="hidden" name="id" value={entry.id} />
              <button className="secondary" type="submit">Remove</button>
            </form>
          </div>
        ))}
      </div>
    </main>
  );
}
