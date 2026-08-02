-- Bill editing, with an append-only record of every edit.
--
-- A bill is a document the shop has already handed to someone, so revising one
-- is an event, not a silent overwrite. `bill_revisions` keeps the whole before
-- and after plus a required reason, which is what makes "who changed this and
-- why?" answerable — and what makes unexplained edits visible.

ALTER TABLE "bills" ADD COLUMN "revisionCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "bills" ADD COLUMN "lastRevisedAt" TIMESTAMP(3);

CREATE TABLE "bill_revisions" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "changes" JSONB NOT NULL,
    "amountDelta" DECIMAL(14,2) NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_revisions_pkey" PRIMARY KEY ("id")
);

-- One row per (bill, revision number): the sequence cannot fork or repeat.
CREATE UNIQUE INDEX "bill_revisions_billId_revision_key" ON "bill_revisions"("billId", "revision");
CREATE INDEX "bill_revisions_billId_idx" ON "bill_revisions"("billId");
-- Powers the owner's "who has been editing bills?" view.
CREATE INDEX "bill_revisions_changedById_createdAt_idx" ON "bill_revisions"("changedById", "createdAt");
CREATE INDEX "bill_revisions_createdAt_idx" ON "bill_revisions"("createdAt");

ALTER TABLE "bill_revisions" ADD CONSTRAINT "bill_revisions_billId_fkey"
  FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT, not SET NULL: an edit must always name the person who made it, so
-- a staff account cannot be removed to orphan its own edit history.
ALTER TABLE "bill_revisions" ADD CONSTRAINT "bill_revisions_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
