import { parseCallerIdEnv } from "@/lib/caller-id/select";
import { prisma } from "@/lib/db";

const DEMO_NUMBERS = [
  { e164: "+14155551000", state: "CA", areaCode: "415", isDefault: true, label: "DEMO San Francisco" },
  { e164: "+12125551000", state: "NY", areaCode: "212", isDefault: false, label: "DEMO New York" },
  { e164: "+13055551000", state: "FL", areaCode: "305", isDefault: false, label: "DEMO Miami" },
  { e164: "+18725551000", state: "IL", areaCode: "872", isDefault: false, label: "DEMO Chicago" },
];

export async function seedReferenceData(): Promise<void> {
  const parsed = parseCallerIdEnv(process.env.CALLER_ID_NUMBERS);
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.join("; "));
  }
  for (const number of parsed.numbers) {
    if (number.isDefault) {
      await prisma.callerIdNumber.updateMany({ data: { isDefault: false } });
    }
    await prisma.callerIdNumber.upsert({
      where: { e164: number.e164 },
      update: {
        state: number.state,
        areaCode: number.areaCode,
        isDefault: Boolean(number.isDefault),
        label: number.label,
        demo: false,
        active: true,
      },
      create: {
        e164: number.e164,
        state: number.state,
        areaCode: number.areaCode,
        isDefault: Boolean(number.isDefault),
        label: number.label,
        demo: false,
        active: true,
      },
    });
  }

  if (process.env.SEED_DEMO_DATA !== "true") return;

  for (const number of DEMO_NUMBERS) {
    await prisma.callerIdNumber.upsert({
      where: { e164: number.e164 },
      update: {
        state: number.state,
        areaCode: number.areaCode,
        label: number.label,
        demo: true,
        active: true,
      },
      create: {
        e164: number.e164,
        state: number.state,
        areaCode: number.areaCode,
        label: number.label,
        isDefault: false,
        demo: true,
        active: true,
      },
    });
  }
  const realDefault = await prisma.callerIdNumber.count({ where: { isDefault: true, active: true, demo: false } });
  if (realDefault === 0) {
    await prisma.callerIdNumber.updateMany({ where: { demo: true }, data: { isDefault: false } });
    await prisma.callerIdNumber.update({
      where: { e164: DEMO_NUMBERS[0].e164 },
      data: { isDefault: true },
    });
  }
  await prisma.dncEntry.upsert({
    where: { e164: "+17025550100" },
    update: { reason: "DEMO — requested removal", demo: true, source: "INTERNAL" },
    create: {
      e164: "+17025550100",
      reason: "DEMO — requested removal",
      demo: true,
      source: "INTERNAL",
    },
  });
}
