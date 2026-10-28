import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.userId === "string" ? token.userId : "";
        session.user.role = token.role === "ADMIN" ? "ADMIN" : "REP";
      }
      return session;
    },
    jwt({ token }) {
      return token;
    },
  },
} satisfies NextAuthConfig;
