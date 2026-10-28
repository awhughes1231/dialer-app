import { DISCLOSURE_TEXT } from "@/lib/compliance/recording";

export const TELNYX_API_ROOT = "https://api.telnyx.com/v2";

export function telnyxRecordStartBody(): Record<string, unknown> {
  return {
    format: "mp3",
    channels: "single",
    play_beep: false,
  };
}

export function telnyxSpeakBody(text: string = DISCLOSURE_TEXT): Record<string, unknown> {
  return {
    payload: text,
    voice: "female",
    language: "en-US",
  };
}

export function telnyxPlaybackBody(audioUrl: string): Record<string, unknown> {
  return {
    audio_url: audioUrl,
    overlay: false,
    target_legs: "both",
  };
}

export type TelnyxFetch = (url: string, init: RequestInit) => Promise<Response>;

export class TelnyxProvider {
  readonly name = "telnyx" as const;

  constructor(
    private readonly options: {
      apiKey: string;
      connectionId: string;
      disclosureAudioUrl?: string | null;
      fetchImpl?: TelnyxFetch;
    },
  ) {}

  private async command(callControlId: string, action: string, body: Record<string, unknown>): Promise<void> {
    if (!this.options.apiKey) throw new Error("TELNYX_API_KEY is not set");
    const response = await (this.options.fetchImpl ?? fetch)(
      `${TELNYX_API_ROOT}/calls/${encodeURIComponent(callControlId)}/actions/${action}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Telnyx ${action} failed (${response.status}): ${text.slice(0, 300)}`);
    }
  }

  async startRecording(callControlId: string): Promise<void> {
    await this.command(callControlId, "record_start", telnyxRecordStartBody());
  }

  async playDisclosure(callControlId: string, text: string): Promise<void> {
    if (this.options.disclosureAudioUrl) {
      await this.command(callControlId, "playback_start", telnyxPlaybackBody(this.options.disclosureAudioUrl));
      return;
    }
    await this.command(callControlId, "speak", telnyxSpeakBody(text));
  }

  async hangup(callControlId: string): Promise<void> {
    await this.command(callControlId, "hangup", {});
  }

  async mintBrowserLogin(): Promise<{ mode: "telnyx"; loginToken: string }> {
    if (!this.options.apiKey || !this.options.connectionId) {
      throw new Error("Set TELNYX_API_KEY and TELNYX_CONNECTION_ID before placing a browser call");
    }
    const fetcher = this.options.fetchImpl ?? fetch;
    const created = await fetcher(`${TELNYX_API_ROOT}/telephony_credentials`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connection_id: this.options.connectionId,
        name: `wala-dialer-${Date.now()}`,
      }),
    });
    if (!created.ok) {
      const text = await created.text();
      throw new Error(`Telnyx telephony credential failed (${created.status}): ${text.slice(0, 300)}`);
    }
    const createdJson = (await created.json()) as { data?: { id?: string } };
    const credentialId = createdJson.data?.id;
    if (!credentialId) throw new Error("Telnyx did not return a telephony credential id");
    const tokenResponse = await fetcher(`${TELNYX_API_ROOT}/telephony_credentials/${credentialId}/token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.options.apiKey}` },
    });
    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      throw new Error(`Telnyx login token failed (${tokenResponse.status}): ${text.slice(0, 300)}`);
    }
    const token = (await tokenResponse.text()).trim().replace(/^"|"$/g, "");
    if (!token) throw new Error("Telnyx returned an empty login token");
    return { mode: "telnyx", loginToken: token };
  }
}

export class TwilioProvider {
  readonly name = "twilio" as const;

  mintBrowserLogin(): Promise<never> {
    return Promise.reject(new Error("Twilio is not configured. TELEPHONY_MODE=telnyx is the Phase 1 provider. The TelephonyProvider interface is the swap point."));
  }

  startRecording(): Promise<never> {
    return this.mintBrowserLogin();
  }

  playDisclosure(): Promise<never> {
    return this.mintBrowserLogin();
  }

  hangup(): Promise<never> {
    return this.mintBrowserLogin();
  }
}

export class MockTelephonyProvider {
  readonly name = "mock" as const;
  readonly recordings: string[] = [];
  readonly disclosures: string[] = [];
  readonly hangups: string[] = [];

  async mintBrowserLogin(): Promise<{ mode: "mock" }> {
    return { mode: "mock" };
  }

  async startRecording(callControlId: string): Promise<void> {
    this.recordings.push(callControlId);
  }

  async playDisclosure(callControlId: string, text: string): Promise<void> {
    this.disclosures.push(`${callControlId}:${text}`);
  }

  async hangup(callControlId: string): Promise<void> {
    this.hangups.push(callControlId);
  }
}
