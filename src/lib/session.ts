import type { User } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function currentUser(): Promise<User | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({ where: { id: session.user.id } });
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) {
    const error = new Error("Sign in required");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    const error = new Error("Admin only");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  return user;
}
