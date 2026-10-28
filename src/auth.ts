import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { authConfig } from "@/auth.config";
import { isEmailAllowed, roleForEmail } from "@/lib/auth-policy";
import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/db";

function policy() {
  const config = getConfig();
  return {
    domain: config.allowedEmailDomain,
    allowlist: config.allowedEmails,
    admins: config.adminEmails,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    ...(process.env.AUTH_DEV_LOGIN === "true"
      ? [
          Credentials({
            credentials: {
              email: { label: "Email", type: "email" },
              name: { label: "Name", type: "text" },
            },
            authorize: async (credentials) => {
              const email = String(credentials?.email ?? "").trim().toLowerCase();
              const name = String(credentials?.name ?? "").trim().slice(0, 80);
              const rules = policy();
              if (!isEmailAllowed(email, rules) || !name) return null;
              return { id: email, email, name };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      const email = user.email?.toLowerCase();
      const rules = policy();
      if (!isEmailAllowed(email, rules)) return false;
      if (account?.provider === "google") {
        const verified = profile && "email_verified" in profile ? Boolean(profile.email_verified) : false;
        if (!verified) return false;
      }
      return true;
    },
    async jwt({ token, user }) {
      const email = (user?.email ?? token.email ?? "").toLowerCase();
      if (user?.email) {
        const rules = policy();
        const role = roleForEmail(email, rules.admins);
        const record = await prisma.user.upsert({
          where: { email },
          update: { name: user.name ?? email, role },
          create: { email, name: user.name ?? email, role, image: user.image },
        });
        token.userId = record.id;
        token.role = record.role;
        token.email = record.email;
      }
      return token;
    },
  },
});
