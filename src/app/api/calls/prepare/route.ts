import { NextResponse } from "next/server";
import { z } from "zod";
import { prepareCall } from "@/lib/calls/service";
import { getConfig } from "@/lib/config";
import { jsonError } from "@/lib/http";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    personId: z.string().uuid().optional(),
    companyId: z.string().uuid().optional(),
    opportunityId: z.string().uuid().optional(),
    phone: z.string().min(7).max(40).optional(),
  })
  .refine((value) => value.personId || value.companyId || value.opportunityId || value.phone, {
    message: "Provide a Twenty record or a phone number",
  });

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = bodySchema.parse(await request.json());
    const { call, decision } = await prepareCall({ user, ...body });
    const config = getConfig();
    return NextResponse.json({
      callId: call.id,
      status: call.status,
      allowed: decision.allowed,
      blocks: decision.blocks,
      warnings: decision.warnings,
      to: decision.e164,
      from: decision.callerId?.e164 ?? null,
      callerIdReason: decision.callerId?.reason ?? null,
      recordingMode: decision.recording.mode,
      disclosureRequired: decision.recording.disclosureRequired,
      disclosureText: decision.recording.disclosureText,
      telephonyMode: config.telephonyMode,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues.map((issue) => issue.message).join(" ") }, { status: 400 });
    }
    return jsonError(error);
  }
}
