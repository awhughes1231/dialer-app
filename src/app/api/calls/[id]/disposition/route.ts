import { NextResponse } from "next/server";
import { z } from "zod";
import { saveDisposition } from "@/lib/calls/service";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  disposition: z.string(),
  notes: z.string().max(5000).optional(),
  nextFollowUp: z.string().optional(),
  addToDnc: z.boolean().optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    const call = await prisma.call.findUnique({ where: { id } });
    if (!call || (call.repId !== user.id && user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }
    const saved = await saveDisposition({
      call,
      disposition: body.disposition,
      notes: body.notes,
      nextFollowUp: body.nextFollowUp,
      addToDnc: body.addToDnc,
      actor: user,
    });
    return NextResponse.json({
      callId: saved.call.id,
      twentyCallId: saved.call.twentyCallId,
      twentySyncStatus: saved.call.twentySyncStatus,
      twentySyncError: saved.call.twentySyncError,
      warnings: saved.result.warnings,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Check the disposition form and try again." }, { status: 400 });
    return jsonError(error);
  }
}
