-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('REP', 'ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'REP',
    "image" TEXT,
    "twentyMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallerIdNumber" (
    "id" TEXT NOT NULL,
    "e164" TEXT NOT NULL,
    "areaCode" TEXT,
    "state" TEXT,
    "label" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "telnyxPhoneNumberId" TEXT,
    "cnamDisplayName" TEXT,
    "cnamStatus" TEXT NOT NULL DEFAULT 'unregistered',
    "stirShakenStatus" TEXT NOT NULL DEFAULT 'telnyx_default',
    "brandedCallerIdStatus" TEXT NOT NULL DEFAULT 'not_started',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallerIdNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DncEntry" (
    "id" TEXT NOT NULL,
    "e164" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'INTERNAL',
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DncEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "repId" TEXT,
    "repName" TEXT,
    "repEmail" TEXT,
    "direction" TEXT NOT NULL,
    "fromNumber" TEXT,
    "toNumber" TEXT NOT NULL,
    "personId" TEXT,
    "companyId" TEXT,
    "opportunityId" TEXT,
    "prospectName" TEXT,
    "companyName" TEXT,
    "prospectState" TEXT,
    "prospectTimezone" TEXT,
    "areaCode" TEXT,
    "localTimeLabel" TEXT,
    "complianceSummary" TEXT,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "disposition" TEXT,
    "notes" TEXT,
    "recordingUrl" TEXT,
    "recordingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "disclosureRequired" BOOLEAN NOT NULL DEFAULT false,
    "disclosurePlayed" BOOLEAN NOT NULL DEFAULT false,
    "recordingMode" TEXT,
    "callerIdReason" TEXT,
    "blockReason" TEXT,
    "warnings" TEXT,
    "hangupCause" TEXT,
    "providerError" TEXT,
    "telnyxCallControlId" TEXT,
    "telnyxCallSessionId" TEXT,
    "twentyCallId" TEXT,
    "twentyNoteId" TEXT,
    "twentySyncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "twentySyncError" TEXT,
    "nextFollowUp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CallerIdNumber_e164_key" ON "CallerIdNumber"("e164");

-- CreateIndex
CREATE UNIQUE INDEX "DncEntry_e164_key" ON "DncEntry"("e164");

-- CreateIndex
CREATE UNIQUE INDEX "Call_telnyxCallControlId_key" ON "Call"("telnyxCallControlId");

-- CreateIndex
CREATE INDEX "Call_repId_createdAt_idx" ON "Call"("repId", "createdAt");

-- CreateIndex
CREATE INDEX "Call_status_idx" ON "Call"("status");

-- CreateIndex
CREATE INDEX "Call_toNumber_idx" ON "Call"("toNumber");

-- CreateIndex
CREATE INDEX "Call_twentySyncStatus_idx" ON "Call"("twentySyncStatus");

-- CreateIndex
CREATE INDEX "Call_createdAt_idx" ON "Call"("createdAt");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

