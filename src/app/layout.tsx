import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wala Dialer",
  description: "Self-hosted click-to-call for E-Commerce Wala.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const devLogin = process.env.AUTH_DEV_LOGIN === "true";
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Nav devLogin={devLogin} />
          {devLogin ? (
            <div className="banner warn">Developer login is enabled. Set AUTH_DEV_LOGIN=false before this dialer is reachable on the internet.</div>
          ) : null}
          {children}
        </div>
      </body>
    </html>
  );
}
