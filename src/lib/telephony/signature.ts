import { createPublicKey, verify, type KeyObject } from "node:crypto";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function publicKeyFromTelnyx(value: string): KeyObject {
  const trimmed = value.trim();
  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    return createPublicKey(trimmed);
  }
  const decoded = Buffer.from(trimmed, "base64");
  const spki = decoded.length === 32 ? Buffer.concat([ED25519_SPKI_PREFIX, decoded]) : decoded;
  return createPublicKey({ key: spki, format: "der", type: "spki" });
}

export function verifyTelnyxSignature(input: {
  rawBody: string;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  publicKey: string;
  toleranceSeconds: number;
  now?: Date;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.publicKey) return { ok: false, reason: "TELNYX_PUBLIC_KEY is not configured" };
  if (!input.signature || !input.timestamp) return { ok: false, reason: "Missing Telnyx signature headers" };
  const timestamp = Number(input.timestamp);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: "Invalid Telnyx timestamp" };
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - timestamp) > input.toleranceSeconds) {
    return { ok: false, reason: "Telnyx webhook timestamp is outside the tolerance window" };
  }
  let key: KeyObject;
  try {
    key = publicKeyFromTelnyx(input.publicKey);
  } catch {
    return { ok: false, reason: "TELNYX_PUBLIC_KEY is not a valid Ed25519 public key" };
  }
  const message = Buffer.from(`${input.timestamp}|${input.rawBody}`);
  let signature: Buffer;
  try {
    signature = Buffer.from(input.signature, "base64");
  } catch {
    return { ok: false, reason: "Telnyx signature is not base64" };
  }
  const valid = verify(null, message, key, signature);
  return valid ? { ok: true } : { ok: false, reason: "Telnyx signature does not match the payload" };
}
