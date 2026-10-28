import { prisma } from "@/lib/db";
import { toE164 } from "@/lib/phone";
import type { CallStore } from "@/lib/telephony/webhook-handler";
import { toSnapshot } from "@/lib/calls/service";
import type { CallSnapshot } from "@/lib/telephony/events";

const ACTIVE = ["READY", "DIALING", "RINGING", "IN_PROGRESS", "ON_HOLD"];

function dateOrNull(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

export function createPrismaCallStore(): CallStore {
  return {
    async findById(id) {
      const call = await prisma.call.findUnique({ where: { id } });
      return call ? toSnapshot(call) : null;
    },
    async findByControlId(id) {
      const call = await prisma.call.findUnique({ where: { telnyxCallControlId: id } });
      return call ? toSnapshot(call) : null;
    },
    async findActiveByNumbers(from, to) {
      const toNumber = to ? toE164(to) ?? to : null;
      const fromNumber = from ? toE164(from) : null;
      if (!toNumber && !fromNumber) return null;
      const call = await prisma.call.findFirst({
        where: {
          status: { in: ACTIVE },
          ...(toNumber ? { toNumber } : {}),
          ...(fromNumber ? { fromNumber } : {}),
        },
        orderBy: { createdAt: "desc" },
      });
      return call ? toSnapshot(call) : null;
    },
    async save(snapshot: CallSnapshot) {
      await prisma.call.update({
        where: { id: snapshot.id },
        data: {
          status: snapshot.status,
          fromNumber: snapshot.fromNumber,
          startedAt: dateOrNull(snapshot.startedAt),
          answeredAt: dateOrNull(snapshot.answeredAt),
          endedAt: dateOrNull(snapshot.endedAt),
          durationSeconds: snapshot.durationSeconds,
          recordingUrl: snapshot.recordingUrl,
          recordingStatus: snapshot.recordingStatus,
          disclosurePlayed: snapshot.disclosurePlayed,
          telnyxCallControlId: snapshot.telnyxCallControlId,
          telnyxCallSessionId: snapshot.telnyxCallSessionId,
          hangupCause: snapshot.hangupCause,
          providerError: snapshot.providerError,
        },
      });
    },
    async hasEvent(id) {
      const existing = await prisma.webhookEvent.findUnique({ where: { id } });
      return Boolean(existing);
    },
    async rememberEvent(id, type) {
      await prisma.webhookEvent.upsert({
        where: { id },
        update: {},
        create: { id, provider: "telnyx", eventType: type },
      });
    },
  };
}
