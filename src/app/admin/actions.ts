"use server";

import { revalidatePath } from "next/cache";
import { areaCodeOf, toE164 } from "@/lib/phone";
import { normalizeState } from "@/lib/compliance/geography";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export async function addCallerIdAction(formData: FormData) {
  await requireAdmin();
  const e164 = toE164(String(formData.get("phone") ?? ""));
  if (!e164) throw new Error("Enter a valid US number");
  const state = normalizeState(String(formData.get("state") ?? "")) ?? undefined;
  const areaCode = String(formData.get("areaCode") ?? "").trim() || areaCodeOf(e164) || undefined;
  const isDefault = formData.get("isDefault") === "on";
  if (isDefault) await prisma.callerIdNumber.updateMany({ data: { isDefault: false } });
  await prisma.callerIdNumber.upsert({
    where: { e164 },
    update: {
      state,
      areaCode,
      label: String(formData.get("label") ?? "") || null,
      isDefault,
      active: true,
      demo: false,
      cnamDisplayName: String(formData.get("cnam") ?? "") || null,
    },
    create: {
      e164,
      state,
      areaCode,
      label: String(formData.get("label") ?? "") || null,
      isDefault,
      active: true,
      demo: false,
      cnamDisplayName: String(formData.get("cnam") ?? "") || null,
    },
  });
  revalidatePath("/admin/numbers");
}

export async function deactivateCallerIdAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await prisma.callerIdNumber.update({ where: { id }, data: { active: false, isDefault: false } });
  revalidatePath("/admin/numbers");
}

export async function addDncAction(formData: FormData) {
  await requireAdmin();
  const e164 = toE164(String(formData.get("phone") ?? ""));
  if (!e164) throw new Error("Enter a valid phone number");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("Add a reason");
  const user = await requireAdmin();
  await prisma.dncEntry.upsert({
    where: { e164 },
    update: { reason, source: "INTERNAL", demo: false },
    create: { e164, reason, source: "INTERNAL", createdBy: user.email, demo: false },
  });
  revalidatePath("/admin/dnc");
}

export async function removeDncAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await prisma.dncEntry.delete({ where: { id } });
  revalidatePath("/admin/dnc");
}
