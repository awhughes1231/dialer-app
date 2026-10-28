"use client";

import { useEffect, useRef, useState } from "react";
import { DISPOSITIONS } from "@/lib/dispositions";
import { evaluateCallingWindow } from "@/lib/compliance/hours";
import { formatPhone } from "@/lib/phone";

type Preview = {
  allowed: boolean;
  blocks: string[];
  warnings: string[];
  to: string | null;
  from: string | null;
  callerIdReason: string | null;
  recordingMode: string;
  disclosureRequired: boolean;
  disclosureText: string;
  timeZones: string[];
  windowStart: number;
  windowEnd: number;
};

type RemoteCall = {
  status?: string;
  recordingStatus?: string;
  recordingUrl?: string | null;
  disclosurePlayed?: boolean;
  providerError?: string | null;
  durationSeconds?: number | null;
  twentySyncStatus?: string;
  twentySyncError?: string | null;
  twentyCallId?: string | null;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function formatTimer(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function Softphone({
  personId,
  companyId,
  opportunityId,
  phone,
  preview,
  telephonyMode,
  suggestedDisposition,
  initialCall,
}: {
  personId: string | null;
  companyId: string | null;
  opportunityId: string | null;
  phone: string | null;
  preview: Preview;
  telephonyMode: "mock" | "telnyx" | "twilio";
  suggestedDisposition: string | null;
  initialCall?: { id: string; status: string; disposition: string | null } | null;
}) {
  const [status, setStatus] = useState(initialCall?.status ?? "READY");
  const [callId, setCallId] = useState<string | null>(initialCall?.id ?? null);
  const [blocks, setBlocks] = useState(preview.blocks);
  const [warnings, setWarnings] = useState(preview.warnings);
  const [from, setFrom] = useState(preview.from);
  const [to, setTo] = useState(preview.to);
  const [callerIdReason, setCallerIdReason] = useState(preview.callerIdReason);
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [tones, setTones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [remote, setRemote] = useState<RemoteCall>({});
  const [disposition, setDisposition] = useState(suggestedDisposition ?? "CONNECTED");
  const [notes, setNotes] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [addToDnc, setAddToDnc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const started = useRef<number | null>(null);
  const callRef = useRef<{
    hangup: () => void;
    muteAudio?: () => void;
    unmuteAudio?: () => void;
    hold?: () => void;
    unhold?: () => void;
    dtmf?: (digit: string) => void;
  } | null>(null);
  const clientRef = useRef<{ disconnect?: () => void } | null>(null);
  const mockTimers = useRef<number[]>([]);

  const clock = preview.timeZones.length
    ? evaluateCallingWindow(new Date(), preview.timeZones, preview.windowStart, preview.windowEnd)
    : null;
  const windowOpen = clock ? clock.open : true;
  const live = status === "DIALING" || status === "RINGING" || status === "IN_PROGRESS" || status === "ON_HOLD";
  const ended = status === "ENDED" || status === "FAILED";

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      if (started.current) setSeconds(Math.floor((Date.now() - started.current) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [live]);

  useEffect(() => {
    if (!callId || !live) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/calls/${callId}`);
      if (!response.ok) return;
      const body = await response.json();
      setRemote(body.call ?? {});
      if (body.call?.status === "ENDED" || body.call?.status === "FAILED") {
        setStatus(body.call.status);
        clearMock();
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [callId, live]);

  useEffect(() => {
    return () => {
      clearMock();
      try {
        callRef.current?.hangup();
      } catch {
        // The browser session may already be gone.
      }
      clientRef.current?.disconnect?.();
    };
  }, []);

  function clearMock() {
    for (const timer of mockTimers.current) window.clearTimeout(timer);
    mockTimers.current = [];
  }

  async function postEvent(id: string, type: string) {
    await fetch(`/api/calls/${id}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type }),
    });
  }

  async function dial() {
    setError(null);
    setSavedMessage(null);
    const response = await fetch("/api/calls/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personId: personId ?? undefined,
        companyId: companyId ?? undefined,
        opportunityId: opportunityId ?? undefined,
        phone: phone ?? undefined,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Could not prepare the call");
      return;
    }
    setCallId(body.callId);
    setBlocks(body.blocks ?? []);
    setWarnings(body.warnings ?? []);
    setFrom(body.from);
    setTo(body.to);
    setCallerIdReason(body.callerIdReason);
    if (!body.allowed) {
      setStatus("BLOCKED");
      return;
    }
    started.current = Date.now();
    setSeconds(0);
    setStatus("DIALING");
    await postEvent(body.callId, "dialing");
    if (body.telephonyMode === "mock" || telephonyMode === "mock") {
      mockTimers.current.push(
        window.setTimeout(() => {
          setStatus("RINGING");
          void postEvent(body.callId, "ringing");
        }, 700),
      );
      mockTimers.current.push(
        window.setTimeout(() => {
          setStatus("IN_PROGRESS");
          void postEvent(body.callId, "answered");
          if (body.disclosureRequired) {
            setRemote((current) => ({ ...current, disclosurePlayed: true }));
            void postEvent(body.callId, "disclosure_played");
          }
        }, 2200),
      );
      return;
    }
    try {
      const tokenResponse = await fetch("/api/telnyx/token", { method: "POST" });
      const tokenBody = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(tokenBody.error ?? "Telnyx login failed");
      const sdk = await import("@telnyx/webrtc");
      const client = new sdk.TelnyxRTC({ login_token: tokenBody.loginToken });
      clientRef.current = client;
      client.on("telnyx.notification", (notification: { type?: string; call?: { state?: string } }) => {
        if (notification.type !== "callUpdate") return;
        const state = notification.call?.state;
        if (state === "ringing" || state === "early") {
          setStatus("RINGING");
          void postEvent(body.callId, "ringing");
        }
        if (state === "active") {
          setStatus("IN_PROGRESS");
          void postEvent(body.callId, "answered");
        }
        if (state === "held") {
          setHeld(true);
          setStatus("ON_HOLD");
          void postEvent(body.callId, "hold");
        }
        if (state === "hangup" || state === "destroy" || state === "purge") {
          setStatus("ENDED");
          void postEvent(body.callId, "hangup");
        }
      });
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Telnyx did not register in time")), 15000);
        client.on("telnyx.ready", () => {
          window.clearTimeout(timeout);
          resolve();
        });
        client.on("telnyx.error", (sdkError: { message?: string }) => {
          window.clearTimeout(timeout);
          reject(new Error(sdkError?.message ?? "Telnyx error"));
        });
        client.connect();
      });
      const clientState = btoa(JSON.stringify({ callId: body.callId }));
      callRef.current = client.newCall({
        destinationNumber: body.to,
        callerNumber: body.from,
        callerName: "E-Commerce Wala",
        audio: true,
        video: false,
        clientState,
        customHeaders: [{ name: "X-ECW-Call-Id", value: body.callId }],
      });
    } catch (dialError) {
      setStatus("FAILED");
      setError(dialError instanceof Error ? dialError.message : "The call could not start");
      await postEvent(body.callId, "failed");
    }
  }

  async function hangup() {
    clearMock();
    try {
      callRef.current?.hangup();
    } catch {
      // Server hangup still runs.
    }
    if (callId) await postEvent(callId, "hangup");
    setStatus((current) => (current === "FAILED" ? current : "ENDED"));
    if (status === "RINGING" || status === "DIALING") setDisposition("NO_ANSWER");
  }

  function toggleMute() {
    if (muted) callRef.current?.unmuteAudio?.();
    else callRef.current?.muteAudio?.();
    setMuted((value) => !value);
  }

  async function toggleHold() {
    if (!callId) return;
    if (held) {
      callRef.current?.unhold?.();
      setHeld(false);
      setStatus("IN_PROGRESS");
      await postEvent(callId, "unhold");
    } else {
      callRef.current?.hold?.();
      setHeld(true);
      setStatus("ON_HOLD");
      await postEvent(callId, "hold");
    }
  }

  function sendTone(digit: string) {
    if (status !== "IN_PROGRESS") return;
    callRef.current?.dtmf?.(digit);
    setTones((value) => `${value}${digit}`.slice(-24));
  }

  async function saveDisposition(event: React.FormEvent) {
    event.preventDefault();
    if (!callId) return;
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/calls/${callId}/disposition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ disposition, notes, nextFollowUp: nextFollowUp || undefined, addToDnc }),
    });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(body.error ?? "Could not save the call");
      return;
    }
    setRemote(body);
    setSavedMessage(body.twentySyncError || (body.warnings ?? []).join(" ") || "Saved to Twenty.");
  }

  const statusLabel =
    status === "IN_PROGRESS" ? "Connected" : status === "ON_HOLD" ? "On hold" : status === "BLOCKED" ? "Blocked" : status.charAt(0) + status.slice(1).toLowerCase();

  return (
    <section className="handset" aria-label="Softphone">
      <div className="status">
        <div>
          <div className="muted">Call status</div>
          <strong>{statusLabel}</strong>
        </div>
        <div className="timer" aria-live="polite">
          {live || ended ? formatTimer(remote.durationSeconds ?? seconds) : "0:00"}
        </div>
      </div>
      <p>
        {to ? formatPhone(to) : "No number"} {from ? <span className="muted">from {formatPhone(from)}</span> : null}
      </p>
      {callerIdReason ? <p className="muted">{callerIdReason}</p> : null}
      {preview.disclosureRequired ? (
        <p>When the call connects, both sides hear: “{preview.disclosureText}”</p>
      ) : (
        <p>{preview.recordingMode === "skip" ? "Recording stays off for this call." : "This call can be recorded without a spoken notice."}</p>
      )}
      {remote.disclosurePlayed ? <p>Recording notice played.</p> : null}
      {remote.recordingUrl ? (
        <p>
          <a href={remote.recordingUrl}>Recording</a>
        </p>
      ) : null}
      {blocks.map((block) => (
        <div className="banner bad" key={block}>
          {block}
        </div>
      ))}
      {warnings.map((warning) => (
        <div className="banner warn" key={warning}>
          {warning}
        </div>
      ))}
      {error ? <div className="banner bad">{error}</div> : null}
      {remote.providerError ? <div className="banner warn">{remote.providerError}</div> : null}
      <div className="controls">
        <button type="button" onClick={dial} disabled={!preview.allowed || !windowOpen || live || status === "BLOCKED"}>
          Dial
        </button>
        <button type="button" onClick={toggleMute} aria-pressed={muted} disabled={!live}>
          {muted ? "Unmute" : "Mute"}
        </button>
        <button type="button" onClick={toggleHold} aria-pressed={held} disabled={status !== "IN_PROGRESS" && status !== "ON_HOLD"}>
          {held ? "Resume" : "Hold"}
        </button>
        <button type="button" className="danger" onClick={hangup} disabled={!live}>
          Hang up
        </button>
      </div>
      <div className="keypad" aria-label="Keypad">
        {KEYS.map((digit) => (
          <button key={digit} type="button" onClick={() => sendTone(digit)} disabled={status !== "IN_PROGRESS"}>
            {digit}
          </button>
        ))}
      </div>
      <p className="tones" aria-live="polite">
        {tones || " "}
      </p>
      {ended && callId ? (
        <form className="stack" onSubmit={saveDisposition}>
          <label>
            Disposition
            <select value={disposition} onChange={(event) => setDisposition(event.target.value)}>
              {DISPOSITIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Notes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <label>
            Next follow-up
            <input type="date" value={nextFollowUp} onChange={(event) => setNextFollowUp(event.target.value)} />
          </label>
          <label>
            <span>
              <input type="checkbox" checked={addToDnc} onChange={(event) => setAddToDnc(event.target.checked)} /> Add this number to the do-not-call list
            </span>
          </label>
          <button className="primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save to Twenty"}
          </button>
          {savedMessage ? <div className="banner ok">{savedMessage}</div> : null}
        </form>
      ) : null}
    </section>
  );
}
