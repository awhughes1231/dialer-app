import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");
  const google = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const devLogin = process.env.AUTH_DEV_LOGIN === "true";
  const secret = Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET);
  return (
    <main className="grid">
      <section>
        <h1>Sign in to call.</h1>
        <p className="muted">
          Reps at E-Commerce Wala use Google Workspace. The dialer places the call in this browser and writes the result back to Twenty.
        </p>
      </section>
      <section className="card stack">
        {!secret ? <div className="banner bad">Set AUTH_SECRET before anyone signs in.</div> : null}
        {google ? (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button className="primary" type="submit">
              Continue with Google
            </button>
          </form>
        ) : (
          <p className="muted">Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.</p>
        )}
        {devLogin ? (
          <form
            className="stack"
            action={async (formData) => {
              "use server";
              await signIn("credentials", {
                email: formData.get("email"),
                name: formData.get("name"),
                redirectTo: "/",
              });
            }}
          >
            <label>
              Name
              <input name="name" required placeholder="Ada Rep" />
            </label>
            <label>
              Work email
              <input name="email" type="email" required placeholder="ada@ecommercewala.co" />
            </label>
            <button className="secondary" type="submit">
              Developer sign-in
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
