import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { DISCLOSURE_TEXT } from "@/lib/compliance/recording";
import { createPrismaCallStore } from "@/lib/telephony/prisma-store";
import { MockTelephonyProvider, TelnyxProvider } from "@/lib/telephony/telnyx";
import { processTelnyxWebhook } from "@/lib/telephony/webhook-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const config = getConfig();
  const telephony =
    config.telephonyMode === "telnyx"
      ? new TelnyxProvider({
          apiKey: config.telnyxApiKey,
          connectionId: config.telnyxConnectionId,
          disclosureAudioUrl: config.telnyxDisclosureAudioUrl || null,
        })
      : new MockTelephonyProvider();
  const result = await processTelnyxWebhook({
    rawBody,
    signature: request.headers.get("telnyx-signature-ed25519"),
    timestamp: request.headers.get("telnyx-timestamp"),
    publicKey: config.telnyxPublicKey,
    toleranceSeconds: config.telnyxWebhookToleranceSeconds,
    now: new Date(),
    store: createPrismaCallStore(),
    telephony,
    disclosureText: DISCLOSURE_TEXT,
  });
  return NextResponse.json(result.body, { status: result.status });
}
