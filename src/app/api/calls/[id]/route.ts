import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const call = await prisma.call.findUnique({ where: { id } });
    if (!call || (call.repId !== user.id && user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }
    return NextResponse.json({
      call: {
        id: call.id,
        status: call.status,
        disposition: call.disposition,
        recordingStatus: call.recordingStatus,
        recordingUrl: call.recordingUrl,
        disclosurePlayed: call.disclosurePlayed,
        providerError: call.providerError,
        durationSeconds: call.durationSeconds,
        twentySyncStatus: call.twentySyncStatus,
        twentySyncError: call.twentySyncError,
        twentyCallId: call.twentyCallId,
        blockReason: call.blockReason,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
