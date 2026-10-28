"use server";

import { revalidatePath } from "next/cache";
import { applyBrowserEvent } from "@/lib/calls/service";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function endCallAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const call = await prisma.call.findUnique({ where: { id } });
  if (!call || (call.repId !== user.id && user.role !== "ADMIN")) return;
  await applyBrowserEvent(call, "hangup");
  revalidatePath("/");
}
