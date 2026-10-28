import { addCallerIdAction, deactivateCallerIdAction } from "@/app/admin/actions";
import { prisma } from "@/lib/db";
import { formatPhone } from "@/lib/phone";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function NumbersPage() {
  await requireAdmin();
  const numbers = await prisma.callerIdNumber.findMany({ orderBy: [{ active: "desc" }, { e164: "asc" }] });
  return (
    <main className="stack">
      <h1>Caller ID pool</h1>
      <p className="muted">
        The dialer picks a number with the prospect&apos;s area code, then the same state, then the default. CNAM and branded-caller status are tracked here. Register them in Telnyx. This app does not submit those registrations.
      </p>
      <form className="card stack" action={addCallerIdAction}>
        <h2>Add a number</h2>
        <label>Number<input name="phone" required placeholder="+14155552671" /></label>
        <label>State<input name="state" placeholder="CA" maxLength={32} /></label>
        <label>Area code<input name="areaCode" placeholder="415" /></label>
        <label>Label<input name="label" placeholder="San Francisco" /></label>
        <label>CNAM display name<input name="cnam" placeholder="ECOMMERCE WALA" maxLength={15} /></label>
        <label><span><input type="checkbox" name="isDefault" /> Default when nothing local matches</span></label>
        <button className="primary" type="submit">Save number</button>
      </form>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Match</th>
              <th>CNAM</th>
              <th>STIR/SHAKEN</th>
              <th>Branded</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {numbers.map((number) => (
              <tr key={number.id}>
                <td>
                  {formatPhone(number.e164)}
                  <div className="muted">
                    {number.label} {number.demo ? "· DEMO" : ""} {number.isDefault ? "· default" : ""} {number.active ? "" : "· inactive"}
                  </div>
                </td>
                <td>{number.areaCode ?? "—"} {number.state ?? ""}</td>
                <td>{number.cnamDisplayName ?? "—"} · {number.cnamStatus}</td>
                <td>{number.stirShakenStatus}</td>
                <td>{number.brandedCallerIdStatus}</td>
                <td>
                  {number.active ? (
                    <form action={deactivateCallerIdAction}>
                      <input type="hidden" name="id" value={number.id} />
                      <button className="secondary" type="submit">Deactivate</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
