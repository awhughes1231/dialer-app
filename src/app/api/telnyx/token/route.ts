import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { jsonError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { TelnyxProvider, TwilioProvider } from "@/lib/telephony/telnyx";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireUser();
    const config = getConfig();
    if (config.telephonyMode === "mock") return NextResponse.json({ mode: "mock" });
    if (config.telephonyMode === "twilio") {
      await new TwilioProvider().mintBrowserLogin();
    }
    const login = await new TelnyxProvider({
      apiKey: config.telnyxApiKey,
      connectionId: config.telnyxConnectionId,
      disclosureAudioUrl: config.telnyxDisclosureAudioUrl || null,
    }).mintBrowserLogin();
    return NextResponse.json(login);
  } catch (error) {
    return jsonError(error, "Could not start the phone connection.");
  }
}
