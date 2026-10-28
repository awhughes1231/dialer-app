import { signOut } from "@/auth";
import { currentUser } from "@/lib/session";

export async function Nav({ devLogin }: { devLogin: boolean }) {
  const user = await currentUser();
  return (
    <header className="nav">
      <a className="brand" href="/">
        <strong>Wala Dialer</strong>
        <span>E-Commerce Wala · click to call</span>
      </a>
      <nav className="nav-links">
        {user ? (
          <>
            <span className="muted">{user.name}</span>
            {user.role === "ADMIN" ? <a href="/admin">Call log</a> : null}
            {user.role === "ADMIN" ? <a href="/admin/numbers">Numbers</a> : null}
            {user.role === "ADMIN" ? <a href="/admin/dnc">DNC</a> : null}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button className="text-button" type="submit">
                Sign out
              </button>
            </form>
          </>
        ) : null}
        {devLogin ? <span className="pill">Dev login on</span> : null}
      </nav>
    </header>
  );
}
