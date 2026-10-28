import { NextResponse } from "next/server";
import { z } from "zod";
import { applyBrowserEvent } from "@/lib/calls/service";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getConfig } from "@/lib/config";
import { TelnyxProvider } from "@/lib/telephony/telnyx";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  type: z.enum(["dialing", "ringing", "answered", "hold", "unhold", "hangup", "failed", "disclosure_played"]),
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
    if (body.type === "hangup" && call.telnyxCallControlId) {
      const config = getConfig();
      if (config.telephonyMode === "telnyx") {
        try {
          await new TelnyxProvider({
            apiKey: config.telnyxApiKey,
            connectionId: config.telnyxConnectionId,
          }).hangup(call.telnyxCallControlId);
        } catch (error) {
          await prisma.call.update({
            where: { id: call.id },
            data: { providerError: error instanceof Error ? error.message : "Hangup failed" },
          });
        }
      }
    }
    const updated = await applyBrowserEvent(call, body.type);
    return NextResponse.json({
      callId: updated.id,
      status: updated.status,
      durationSeconds: updated.durationSeconds,
      disclosurePlayed: updated.disclosurePlayed,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Unknown call event" }, { status: 400 });
    return jsonError(error);
  }
}
